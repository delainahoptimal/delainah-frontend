"use client";

import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, RefreshCw, Sprout, Sun, Thermometer, Wind } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiRequest, errorMessage } from "@/lib/api";
import type { RoleGrant, SessionUser } from "@/lib/api";
import { CoordinateFields } from "@/components/location-inputs";

type Row = Record<string, unknown>;
type Props = { path: string; session: { user: SessionUser; roles: RoleGrant[]; permissions: string[]; permissionError?: boolean }; onToast: (message: string) => void };

function can(session: Props["session"], permission: string) {
  return !session.permissionError && session.permissions.includes(permission);
}

function value(row: Row, key: string, fallback = "—") {
  const found = row[key];
  if (found === null || found === undefined || found === "") return fallback;
  if (typeof found === "object") return String((found as Row).name ?? (found as Row).id ?? fallback);
  return String(found);
}

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function rowsFromPayload(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === "object" && Array.isArray((payload as Row).results)) return (payload as Row).results as Row[];
  return [];
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function forecastLabel(value: unknown, digits = 0, unit = "") {
  const parsed = numberValue(value);
  return parsed === null ? "—" : `${parsed.toFixed(digits)}${unit}`;
}

function forecastDate(value: unknown, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  if (!value) return "—";
  const raw = String(value);
  const parsed = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
  return Number.isNaN(parsed.getTime()) ? raw : new Intl.DateTimeFormat("en-NG", options).format(parsed);
}

function forecastTime(value: unknown) {
  if (!value) return "—";
  const raw = String(value);
  const parsed = new Date(raw.length === 16 ? `${raw}:00` : raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(parsed);
}

function weatherCondition(value: unknown) {
  const code = numberValue(value);
  if (code === null) return { label: "Conditions unavailable", Icon: Cloud };
  if (code === 0) return { label: "Clear sky", Icon: Sun };
  if (code === 1) return { label: "Mainly clear", Icon: CloudSun };
  if (code === 2) return { label: "Partly cloudy", Icon: CloudSun };
  if (code === 3) return { label: "Overcast", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Fog or haze", Icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: "Drizzle", Icon: CloudRain };
  if (code >= 61 && code <= 67) return { label: "Rain", Icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: "Snow", Icon: Cloud };
  if (code >= 80 && code <= 82) return { label: "Rain showers", Icon: CloudRain };
  if (code >= 85 && code <= 86) return { label: "Snow showers", Icon: Cloud };
  if (code >= 95) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "Variable conditions", Icon: Cloud };
}

function dailyField(daily: Row, key: string, index: number) {
  const values = daily[key];
  return Array.isArray(values) ? values[index] : undefined;
}

function farmWeatherAdvice(code: unknown, rainProbability: unknown, temperatureHigh: unknown) {
  const condition = weatherCondition(code).label;
  const rain = numberValue(rainProbability);
  const high = numberValue(temperatureHigh);
  if (condition === "Thunderstorm") return "Monitor local conditions and postpone exposed field work if thunder or lightning is nearby.";
  if (rain !== null && rain >= 60) return "Rain is likely; consider drainage, and avoid scheduling harvest or drying that needs a dry window.";
  if (high !== null && high >= 32) return "Plan strenuous field work for cooler hours and check crops for heat or moisture stress.";
  if (rain !== null && rain <= 10) return "Rain is unlikely; check soil moisture and plan irrigation if crops need water.";
  return "Use the forecast alongside field observations when planning planting, spraying, or harvest.";
}

function dayLength(sunrise: unknown, sunset: unknown) {
  if (!sunrise || !sunset) return null;
  const startValue = String(sunrise);
  const endValue = String(sunset);
  const start = new Date(startValue.length === 16 ? `${startValue}:00` : startValue);
  const end = new Date(endValue.length === 16 ? `${endValue}:00` : endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}

function formatDaylight(minutes: number | null) {
  if (minutes === null) return "—";
  const roundedMinutes = Math.round(minutes);
  return `${Math.floor(roundedMinutes / 60)}h ${roundedMinutes % 60}m`;
}

function RecipientSelector({ audienceType, selectedIds, onChange, inputName = "audience_ids" }: { audienceType: string; selectedIds: string[]; onChange: (ids: string[]) => void; inputName?: string }) {
  const [recipients, setRecipients] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const isFarmerAudience = audienceType === "SELECTED_FARMERS";
  const isUserAudience = audienceType === "SELECTED_USERS";

  useEffect(() => {
    if (!isFarmerAudience && !isUserAudience) return;
    let active = true;
    const query = new URLSearchParams({ page: String(page), page_size: "100" });
    if (search.trim()) query.set("search", search.trim());
    if (isUserAudience) query.set("is_active", "true");
    const endpoint = `${isFarmerAudience ? "farmers/farmers" : "users/users"}?${query}`;
    Promise.resolve().then(() => {
      if (active) { setLoading(true); setError(null); }
      return apiRequest<unknown>(endpoint);
    })
      .then((payload) => {
        if (!active) return;
        const rows = rowsFromPayload(payload);
        setRecipients(isFarmerAudience
          ? rows.filter((row) => ["VERIFIED", "ACTIVE"].includes(String(row.status)))
          : rows.filter((row) => row.is_active !== false));
        setHasNext(Boolean(payload && typeof payload === "object" && (payload as Row).next));
      })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isFarmerAudience, isUserAudience, page, retry, search]);

  if (!isFarmerAudience && !isUserAudience) return null;
  const selected = new Set(selectedIds);
  return <fieldset className="md:col-span-2">
    <legend className="field-label">{isFarmerAudience ? "Select farmers" : "Select users"}</legend>
    <input className="field-control mb-2" aria-label="Search recipients" placeholder="Search by name, email, phone, or farmer number" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    {loading ? <p className="field-hint">Loading recipients…</p>
      : error ? <p role="alert" className="field-hint text-[#a34e3d]">Could not load recipients. <button type="button" className="font-semibold underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>
        : recipients.length === 0 ? <p className="field-hint">No eligible recipients are available.</p>
          : <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--line)] p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {recipients.filter((recipient) => recipient.id).map((recipient) => {
                const id = String(recipient.id ?? "");
                const name = [recipient.first_name, recipient.last_name].filter(Boolean).map(String).join(" ");
                const label = isFarmerAudience
                  ? `${String(recipient.farmer_number ?? recipient.provisional_reference ?? "Farmer")} · ${name || String(recipient.email ?? "Unnamed")}`
                  : `${name || String(recipient.email ?? "User")} · ${String(recipient.email ?? recipient.phone_number ?? "")}`;
                return <label key={id} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" name={inputName} value={id} checked={selected.has(id)} onChange={(event) => onChange(event.target.checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id))} />
                  <span>{label}</span>
                </label>;
              })}
            </div>
          </div>}
    {!loading && !error && recipients.length > 0 && <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted)]"><span>Page {page}</span><div className="flex gap-2"><button type="button" className="font-semibold" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" className="font-semibold" disabled={!hasNext} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
    <span className="field-hint">Choose one or more recipients. Only eligible, active records are listed.</span>
  </fieldset>;
}

function Header({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">{eyebrow}</div><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.02em] sm:text-[30px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p></div>{actions}</div>;
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="surface-panel mb-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2>{actions}</div><div className="p-5">{children}</div></section>;
}

function Feedback({ error, success }: { error: unknown; success?: string }) {
  if (error) return <div role="alert" className="mb-4 rounded-lg border border-[#efc9c0] bg-[#fff6f3] px-4 py-3 text-xs leading-5 text-[#964d3e]">{errorMessage(error)}</div>;
  if (success) return <div role="status" className="mb-4 rounded-lg border border-[#d1e5d3] bg-[#f0f8f0] px-4 py-3 text-xs leading-5 text-[#39714b]">{success}</div>;
  return null;
}

function Field({ name, label, required, type = "text", defaultValue, hint }: { name: string; label: string; required?: boolean; type?: string; defaultValue?: string; hint?: string }) {
  return <label className="field-label">{label}<input className="field-control" name={name} type={type} required={required} defaultValue={defaultValue} /><span className="field-hint">{hint}</span></label>;
}

function TextArea({ name, label, required, defaultValue, hint }: { name: string; label: string; required?: boolean; defaultValue?: string; hint?: string }) {
  return <label className="field-label">{label}<textarea className="field-control min-h-24" name={name} required={required} defaultValue={defaultValue} />{hint && <span className="field-hint">{hint}</span>}</label>;
}

function Button({ children, onClick, disabled, secondary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`${secondary ? "secondary-button" : "primary-button"} disabled:cursor-not-allowed disabled:opacity-50`}>{children}</button>;
}

function Status({ status }: { status: unknown }) {
  const state = String(status ?? "UNKNOWN");
  const tone = ["SENT", "PUBLISHED", "APPROVED", "ACTIVE"].includes(state) ? "status-good" : ["FAILED", "DEAD", "ARCHIVED"].includes(state) ? "status-bad" : "status-wait";
  return <span className={`status-pill ${tone}`}>{state.replaceAll("_", " ")}</span>;
}

function NotificationsPage({ onToast }: Props) {
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [preferences, setPreferences] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [inbox, prefs] = await Promise.all([
        apiRequest<Row[]>("notifications"),
        apiRequest<Row>("notifications/preferences"),
      ]);
      setNotifications(inbox);
      setPreferences(prefs);
      setError(null);
    } catch (reason) { setError(reason); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function markRead(id?: string) {
    setBusy(true);
    try {
      await apiRequest("notifications", { method: "POST", body: id ? { action: "read", notification_id: id } : { action: "mark_all_read" } });
      onToast(id ? "Notification marked as read." : "All notifications marked as read.");
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await apiRequest<Row>("notifications/preferences", {
        method: "PATCH",
        body: {
          in_app_enabled: form.get("in_app_enabled") === "on",
          sms_enabled: form.get("sms_enabled") === "on",
          weather_alert_sms_enabled: form.get("weather_alert_sms_enabled") === "on",
        },
      });
      setPreferences(result);
      onToast("Notification preferences saved.");
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  return <>
    <Header eyebrow="Communication / Inbox" title="Notifications" description="Read platform notifications and manage in-app and SMS delivery preferences." actions={<Button secondary onClick={() => void load()}><RefreshCw size={14} /> Refresh</Button>} />
    <Feedback error={error} />
    {preferences && <Panel title="Delivery preferences"><form key={value(preferences, "updated_at", "preferences")} onSubmit={savePreferences} className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {[
        ["in_app_enabled", "In-app notifications"],
        ["sms_enabled", "SMS notifications"],
        ["weather_alert_sms_enabled", "Weather alert SMS"],
      ].map(([name, label]) => <label key={name} className="flex items-center gap-2 text-xs"><input type="checkbox" name={name} defaultChecked={Boolean(preferences[name])} />{label}</label>)}
      <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button>
    </form></Panel>}
    <Panel title="Inbox" actions={<Button secondary disabled={busy || notifications.every((item) => item.read_at)} onClick={() => void markRead()}>Mark all read</Button>}>
      {notifications.length ? <div className="divide-y divide-[var(--line)]">{notifications.map((item) => <article key={value(item, "id")} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{value(item, "subject", "Notification")}</h3>{!item.read_at && <span className="h-2 w-2 rounded-full bg-[var(--leaf)]" />}</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{value(item, "body")}</p><p className="mt-2 text-[10px] text-[var(--muted)]">{value(item, "category", "General")} · {date(item.created_at)}</p></div>{!item.read_at && <Button secondary disabled={busy} onClick={() => void markRead(value(item, "id"))}>Mark read</Button>}</article>)}</div> : <p className="text-xs text-[var(--muted)]">You’re all caught up. New in-app notifications will appear here.</p>}
    </Panel>
  </>;
}

const audiences = ["ALL_FARMERS", "STATE", "LGA", "WARD", "COMMUNITY", "SELECTED_FARMERS", "FIELD_OFFICERS", "SELECTED_USERS"];

function formIds(form: FormData, name: string) {
  return form.getAll(name).flatMap((id) => String(id).split(",")).map((id) => id.trim()).filter(Boolean);
}

function audienceValues(form: FormData, type: string) {
  const ids = formIds(form, "audience_ids");
  return { audience_type: type, audience_filter: ["ALL_FARMERS", "FIELD_OFFICERS"].includes(type) ? {} : { ids } };
}

function SMSCampaignsPage({ session, onToast }: Props) {
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [audienceType, setAudienceType] = useState("ALL_FARMERS");
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState("");
  const [report, setReport] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const canCreate = can(session, "sms_campaign.create");
  const canUpdate = can(session, "sms_campaign.update");
  const load = useCallback(async () => {
    if (!can(session, "sms_campaign.read")) return;
    try { setCampaigns(await apiRequest<Row[]>("sms-campaigns")); setError(null); }
    catch (reason) { setError(reason); }
  }, [session]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const audience = audienceValues(form, audienceType);
    if (!["ALL_FARMERS", "FIELD_OFFICERS"].includes(audienceType) && formIds(form, "audience_ids").length === 0) {
      setError(new Error("Select at least one recipient or location."));
      return;
    }
    setError(null);
    setBusy("create");
    try {
      const body = {
        name: String(form.get("name")),
        message: String(form.get("message")),
        ...audience,
        scheduled_at: form.get("scheduled_at") ? new Date(String(form.get("scheduled_at"))).toISOString() : null,
      };
      const campaign = editing
        ? await apiRequest<Row>(`sms-campaigns/${value(editing, "id")}`, { method: "PATCH", body })
        : await apiRequest<Row>("sms-campaigns", {
          method: "POST",
          body,
        });
      onToast(editing ? "SMS campaign draft updated." : "SMS campaign draft created.");
      setEditing(null);
      setAudienceType("ALL_FARMERS");
      setAudienceIds([]);
      setLocationIds("");
      formElement.reset();
      await load();
      setSelected(value(campaign, "id"));
    } catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }

  async function action(id: string, command: string) {
    setBusy(`${id}:${command}`);
    setError(null);
    try {
      const result = await apiRequest<Row>(`sms-campaigns/${id}/${command}`, { method: "POST", body: {} });
      onToast(`Campaign ${command} complete.`);
      await load();
      if (command === "preview") setReport(result);
      if (command === "report") setReport(await apiRequest<Row>(`sms-campaigns/${id}/report`));
    } catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }
  async function loadReport(id: string) {
    setBusy(`${id}:report`);
    try { setSelected(id); setReport(await apiRequest<Row>(`sms-campaigns/${id}/report`)); }
    catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }
  function editCampaign(row: Row) {
    const filter = row.audience_filter && typeof row.audience_filter === "object" ? row.audience_filter as Row : {};
    setEditing(row);
    const type = value(row, "audience_type", "ALL_FARMERS");
    setAudienceType(type);
    setAudienceIds(Array.isArray(filter.ids) ? filter.ids.map(String) : []);
    setLocationIds(["STATE", "LGA", "WARD", "COMMUNITY"].includes(type) && Array.isArray(filter.ids) ? filter.ids.map(String).join(", ") : "");
  }

  return <>
    <Header eyebrow="Communication / SMS" title="SMS campaigns" description="Prepare targeted campaigns, preview eligible recipients, submit for independent approval, then send and review delivery reports." actions={<Button secondary onClick={() => void load()}><RefreshCw size={14} /> Refresh</Button>} />
    <Feedback error={error} />
    {(canCreate || editing) && <Panel title={editing ? "Edit campaign draft" : "Create campaign draft"} actions={editing ? <button className="secondary-button" onClick={() => { setEditing(null); setAudienceType("ALL_FARMERS"); setAudienceIds([]); setLocationIds(""); }}>Cancel edit</button> : undefined}><form key={value(editing ?? {}, "id", "new")} onSubmit={create} className="grid gap-4 md:grid-cols-2">
      <Field name="name" label="Campaign name" required defaultValue={editing ? value(editing, "name", "") : ""} />
      <label className="field-label">Recipient group<select className="field-control" name="audience_type" value={audienceType} onChange={(event) => { setAudienceType(event.target.value); setAudienceIds([]); setLocationIds(""); }}>{audiences.map((audience) => <option key={audience}>{audience}</option>)}</select></label>
      <RecipientSelector audienceType={audienceType} selectedIds={audienceIds} onChange={setAudienceIds} />
      {["STATE", "LGA", "WARD", "COMMUNITY"].includes(audienceType) && <label className="field-label">Location IDs<input className="field-control" name="audience_ids" value={locationIds} onChange={(event) => setLocationIds(event.target.value)} /><span className="field-hint">Comma-separated location UUIDs for geographic targeting.</span></label>}
      <Field name="scheduled_at" label="Schedule time" type="datetime-local" defaultValue={editing && typeof editing.scheduled_at === "string" ? editing.scheduled_at.slice(0, 16) : ""} hint="Optional; dispatch waits until the selected time." />
      <div className="md:col-span-2"><TextArea name="message" label="SMS message" required defaultValue={editing ? value(editing, "message", "") : ""} /></div>
      <div className="md:col-span-2"><button className="primary-button" disabled={busy === "create"}>{busy === "create" ? "Saving…" : "Save draft"}</button></div>
    </form></Panel>}
    <Panel title="Campaign history">
      {campaigns.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Campaign</th><th>Audience</th><th>Status</th><th>Recipients</th><th>Created</th><th>Actions</th></tr></thead><tbody>{campaigns.map((row) => {
        const id = value(row, "id");
        const state = value(row, "status");
        return <tr key={id}><td><strong>{value(row, "name")}</strong><p className="mt-1 max-w-xs truncate text-[10px] text-[var(--muted)]">{value(row, "message")}</p></td><td>{value(row, "audience_type")}</td><td><Status status={state} /></td><td>{value(row, "recipient_count", "—")}</td><td>{date(row.created_at)}</td><td><div className="flex flex-wrap gap-1">
          {state === "DRAFT" && canUpdate && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => editCampaign(row)}>Edit</button>}
          <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void action(id, "preview")}>Preview</button>
          {state === "DRAFT" && can(session, "sms_campaign.submit") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void action(id, "submit")}>Submit</button>}
          {state === "SUBMITTED" && can(session, "sms_campaign.approve") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void action(id, "approve")}>Approve</button>}
          {state === "APPROVED" && can(session, "sms_campaign.send") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void action(id, "send")}>Queue send</button>}
          {["PARTIAL", "FAILED"].includes(state) && can(session, "sms_campaign.send") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void action(id, "replay")}>Replay failures</button>}
          <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void loadReport(id)}>Report</button>
        </div></td></tr>;
      })}</tbody></table></div> : <p className="text-xs text-[var(--muted)]">{can(session, "sms_campaign.read") ? "No campaigns have been created." : "Campaign management is not available to this account."}</p>}
    </Panel>
    {report && <Panel title={`Delivery report${selected ? ` · ${selected}` : ""}`}><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-5">{JSON.stringify(report, null, 2)}</pre></Panel>}
  </>;
}

function WeatherPage({ session, onToast }: Props) {
  const [forecast, setForecast] = useState<Row | null>(null);
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const [targetType, setTargetType] = useState("ALL_FARMERS");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [farms, setFarms] = useState<Row[]>([]);
  const [crops, setCrops] = useState<Row[]>([]);
  const [farmCrops, setFarmCrops] = useState<Row[]>([]);
  const [farmsError, setFarmsError] = useState<unknown>(null);
  const [farmsRetry, setFarmsRetry] = useState(0);
  const [cropsError, setCropsError] = useState<unknown>(null);
  const [coordinates, setCoordinates] = useState({ latitude: "", longitude: "" });
  const [selectedHourDay, setSelectedHourDay] = useState("");
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [selectedCropId, setSelectedCropId] = useState("");
  const [cropAdvisory, setCropAdvisory] = useState<Row | null>(null);
  const [cropAdvisoryError, setCropAdvisoryError] = useState<unknown>(null);
  const loadAlerts = useCallback(async () => {
    try { setAlerts(await apiRequest<Row[]>("weather-alerts")); }
    catch (reason) { setError(reason); }
  }, []);
  useEffect(() => { void Promise.resolve().then(loadAlerts); }, [loadAlerts]);
  useEffect(() => {
    if (!can(session, "farm.read")) return;
    let active = true;
    apiRequest<unknown>("farms/farms")
      .then((payload) => { if (active) setFarms(rowsFromPayload(payload)); })
      .catch((reason: unknown) => { if (active) setFarmsError(reason); });
    return () => { active = false; };
  }, [farmsRetry, session]);
  useEffect(() => {
    if (!can(session, "crop.read")) return;
    let active = true;
    apiRequest<unknown>("crops/crops")
      .then((payload) => { if (active) setCrops(rowsFromPayload(payload)); })
      .catch((reason: unknown) => { if (active) setCropsError(reason); });
    return () => { active = false; };
  }, [session]);
  useEffect(() => {
    if (!can(session, "farm_crop.read")) return;
    let active = true;
    apiRequest<unknown>("farm-crops/farm-crops")
      .then((payload) => { if (active) setFarmCrops(rowsFromPayload(payload)); })
      .catch(() => { if (active) setFarmCrops([]); });
    return () => { active = false; };
  }, [session]);
  const pendingCropAdvisoryId = cropAdvisory && ["QUEUED", "GENERATING"].includes(String(cropAdvisory.status))
    ? String(cropAdvisory.id ?? "")
    : "";
  useEffect(() => {
    if (!pendingCropAdvisoryId || !can(session, "advisory.read")) return;
    let active = true;
    const timer = window.setInterval(() => {
      void apiRequest<Row>("advisories/personalized/")
        .then((payload) => {
          if (!active) return;
          const advisories = Array.isArray(payload.advisories) ? payload.advisories as Row[] : [];
          const latest = advisories.find((row) => String(row.id) === pendingCropAdvisoryId);
          if (latest) setCropAdvisory((current) => current ? { ...current, ...latest } : latest);
        })
        .catch((reason: unknown) => { if (active) setCropAdvisoryError(reason); });
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [pendingCropAdvisoryId, session]);
  async function fetchForecast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    const farmId = String(form.get("farm_id") ?? "").trim();
    setSelectedFarmId(farmId);
    if (farmId) query.set("farm_id", farmId);
    else {
      query.set("latitude", String(form.get("latitude") ?? ""));
      query.set("longitude", String(form.get("longitude") ?? ""));
    }
    setBusy("forecast");
    try { setForecast(await apiRequest<Row>(`weather/forecast/?${query.toString()}`)); setError(null); }
    catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }

  async function requestCropAdvisory() {
    if (!selectedFarmId || !selectedCropId) {
      setCropAdvisoryError(new Error("Select a farm and crop before requesting a crop-specific advisory."));
      return;
    }
    setCropAdvisoryError(null);
    setCropAdvisory(null);
    setBusy("crop-advisory");
    try {
      const request = await apiRequest<Row>("advisories/personalized/", {
        method: "POST",
        body: {
          farm_id: selectedFarmId,
          crop_id: selectedCropId,
          ...(selectedFarmCrop ? { farm_crop_id: String(selectedFarmCrop.id) } : {}),
        },
      });
      setCropAdvisory(request);
      onToast("Crop-specific advisory is being prepared.");
    } catch (reason) {
      setCropAdvisoryError(reason);
    } finally {
      setBusy("");
    }
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const type = String(form.get("target_type"));
    const ids = formIds(form, "target_ids");
    if (!["ALL_FARMERS", "FIELD_OFFICERS"].includes(type) && ids.length === 0) {
      setError(new Error("Select at least one recipient or location."));
      return;
    }
    setError(null);
    setBusy("alert");
    try {
      await apiRequest("weather-alerts", {
        method: "POST",
        body: {
          alert_type: form.get("alert_type"),
          severity: form.get("severity"),
          message: form.get("message"),
          starts_at: new Date(String(form.get("starts_at"))).toISOString(),
          ends_at: form.get("ends_at") ? new Date(String(form.get("ends_at"))).toISOString() : null,
          target_type: type,
          target_filter: ["ALL_FARMERS", "FIELD_OFFICERS"].includes(type) ? {} : { ids },
        },
      });
      formElement.reset();
      setTargetType("ALL_FARMERS");
      setTargetIds([]);
      onToast("Weather alert draft created.");
      await loadAlerts();
    } catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }

  async function alertAction(id: string, command: string) {
    setBusy(`${id}:${command}`);
    try {
      await apiRequest(`weather-alerts/${id}/${command}`, { method: "POST", body: {} });
      onToast(`Weather alert ${command} complete.`);
      await loadAlerts();
    } catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }

  const canManageAlerts = can(session, "weather_alert.create");
  const assignedFarmCropRows = selectedFarmId
    ? farmCrops.filter((row) => String(row.farm) === selectedFarmId)
    : [];
  const selectableCrops: Row[] = assignedFarmCropRows.length
    ? assignedFarmCropRows.map((row) => ({
      id: row.crop && typeof row.crop === "object" ? (row.crop as Row).id : row.crop,
      name: row.crop_name,
      season_name: row.season_name,
    }))
    : crops;
  const selectedCrop = selectableCrops.find((crop) => String(crop.id) === selectedCropId);
  const selectedFarmCrop = assignedFarmCropRows.find((row) => {
    const crop = row.crop && typeof row.crop === "object" ? (row.crop as Row).id : row.crop;
    return String(crop) === selectedCropId;
  });
  const selectedCropName = String(selectedCrop?.name ?? selectedCrop?.crop_name ?? "General farm weather");
  const current = forecast?.data && typeof forecast.data === "object" ? forecast.data as Row : {};
  const hourly = current.hourly && typeof current.hourly === "object" ? current.hourly as Row : {};
  const daily = current.daily && typeof current.daily === "object" ? current.daily as Row : {};
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time as unknown[] : [];
  const hourDays = [...new Set(hourlyTimes.map((time) => String(time).slice(0, 10)).filter(Boolean))];
  const hourDay = selectedHourDay && hourDays.includes(selectedHourDay) ? selectedHourDay : hourDays[0] ?? "";
  const visibleHours = hourlyTimes.map((time, index) => ({ time, index })).filter(({ time }) => String(time).startsWith(hourDay));
  const dailyTimes = Array.isArray(daily.time) ? daily.time as unknown[] : [];
  const condition = weatherCondition(current.weather_code);
  const CurrentIcon = condition.Icon;
  const rainProbabilities = dailyTimes.map((_, index) => numberValue(dailyField(daily, "precipitation_probability_max", index)));
  const dryDays = rainProbabilities.filter((probability) => probability !== null && probability <= 10).length;
  const maxTemperature = dailyTimes.reduce<number | null>((max, _, index) => {
    const value = numberValue(dailyField(daily, "temperature_2m_max", index));
    return value === null ? max : max === null ? value : Math.max(max, value);
  }, null);
  const currentTemperature = numberValue(current.temperature_2m);
  const humidity = numberValue(current.relative_humidity_2m);
  const windSpeed = numberValue(current.wind_speed_10m);
  const rainProbabilityToday = numberValue(dailyField(daily, "precipitation_probability_max", 0));
  const rainAmountToday = numberValue(dailyField(daily, "precipitation_sum", 0));
  const todayHigh = numberValue(dailyField(daily, "temperature_2m_max", 0));
  const todayLow = numberValue(dailyField(daily, "temperature_2m_min", 0));
  const sunriseToday = dailyField(daily, "sunrise", 0);
  const sunsetToday = dailyField(daily, "sunset", 0);
  const daylightMinutes = dayLength(sunriseToday, sunsetToday);
  const avgDaylight = dailyTimes.length
    ? dailyTimes.reduce<number>((total, _, index) => total + (dayLength(dailyField(daily, "sunrise", index), dailyField(daily, "sunset", index)) ?? 0), 0) / dailyTimes.length
    : null;
  const hourlyTemperatures = visibleHours.map(({ index }) => numberValue(Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m[index] : undefined));
  const validHourlyTemperatures = hourlyTemperatures.filter((temperature): temperature is number => temperature !== null);
  const hourlyMin = validHourlyTemperatures.length ? Math.floor(Math.min(...validHourlyTemperatures) - 2) : 0;
  const hourlyMax = validHourlyTemperatures.length ? Math.ceil(Math.max(...validHourlyTemperatures) + 2) : 40;
  const hourlyRange = Math.max(1, hourlyMax - hourlyMin);
  const hourlyChartPoints = visibleHours.flatMap(({ time, index }, pointIndex) => {
    const temperature = hourlyTemperatures[pointIndex];
    if (temperature === null) return [];
    const x = visibleHours.length > 1 ? 36 + (pointIndex / (visibleHours.length - 1)) * 688 : 380;
    const y = 220 - ((temperature - hourlyMin) / hourlyRange) * 180;
    return [{ x, y, temperature, time, index }];
  });
  const hourlyLinePath = hourlyChartPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const thresholdY = 220 - ((32 - hourlyMin) / hourlyRange) * 180;
  const coolestHour = hourlyChartPoints.reduce<(typeof hourlyChartPoints)[number] | null>(
    (coolest, point) => !coolest || point.temperature < coolest.temperature ? point : coolest,
    null,
  );
  const hottestHour = hourlyChartPoints.reduce<(typeof hourlyChartPoints)[number] | null>(
    (hottest, point) => !hottest || point.temperature > hottest.temperature ? point : hottest,
    null,
  );
  const heatHours = hourlyChartPoints.filter((point) => point.temperature >= 32).length;
  const hourlySafeWindow = hourlyChartPoints.filter((point) => {
    const hour = Number(String(point.time).slice(11, 13));
    return hour >= 5 && hour <= 10 && point.temperature <= 29.5;
  });
  const bestWindow = hourlySafeWindow.length
    ? `${forecastTime(hourlySafeWindow[0].time)}–${forecastTime(hourlySafeWindow[hourlySafeWindow.length - 1].time)}`
    : "Check local cooler periods";
  const temperatureSwings = dailyTimes.flatMap((_, index) => {
    const high = numberValue(dailyField(daily, "temperature_2m_max", index));
    const low = numberValue(dailyField(daily, "temperature_2m_min", index));
    return high === null || low === null ? [] : [Math.max(0, high - low)];
  });
  const averageSwing = temperatureSwings.length
    ? temperatureSwings.reduce((sum, swing) => sum + swing, 0) / temperatureSwings.length
    : null;
  const dailyChartRows = dailyTimes.map((day, index) => ({
    day,
    index,
    high: numberValue(dailyField(daily, "temperature_2m_max", index)),
    low: numberValue(dailyField(daily, "temperature_2m_min", index)),
    rain: numberValue(dailyField(daily, "precipitation_probability_max", index)),
  })).filter((row) => row.high !== null || row.low !== null || row.rain !== null);
  const dailyTempValues = dailyChartRows.flatMap((row) => [row.high, row.low].filter((temperature): temperature is number => temperature !== null));
  const dailyTempMin = dailyTempValues.length ? Math.floor(Math.min(...dailyTempValues) / 5) * 5 : 0;
  const dailyTempMax = dailyTempValues.length ? Math.ceil(Math.max(...dailyTempValues) / 5) * 5 : 40;
  const dailyTempRange = Math.max(1, dailyTempMax - dailyTempMin);
  const dailyRainPoints = dailyChartRows.flatMap((row, index) => row.rain === null ? [] : [{
    x: dailyChartRows.length > 1 ? 52 + (index / (dailyChartRows.length - 1)) * 620 : 360,
    y: 204 - (row.rain / 100) * 150,
  }]);
  const dailyRainPath = dailyRainPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const veryDry = dryDays > 0 && dryDays >= Math.ceil(dailyTimes.length * 0.7);
  const planningHeadline = veryDry
    ? `Low rainfall is forecast on ${dryDays} of the next ${dailyTimes.length} days`
    : rainProbabilityToday !== null && rainProbabilityToday >= 60
      ? "Rain is likely today; plan field access and drying accordingly"
      : currentTemperature !== null && currentTemperature >= 32
        ? "High temperatures may affect field work during the warmest hours"
        : "Use the local forecast to plan your next field activities";
  const planningDescription = selectedCropId
    ? `These forecast indicators apply to the selected farm location. Request a crop-specific assessment below to include ${selectedCropName}, its recorded season and stage, and the forecast.`
    : `General farm weather: ${humidity !== null && humidity <= 30 ? "low humidity may increase water loss; check soil moisture." : "use forecast conditions alongside local soil and field observations."} ${rainProbabilityToday !== null && rainProbabilityToday <= 10 ? "Rain probability is low today." : rainProbabilityToday !== null && rainProbabilityToday >= 60 ? "Rain probability is elevated today." : ""}`;
  const matrix = [
    {
      title: "Irrigation & watering",
      status: humidity !== null && humidity <= 30 && veryDry ? "caution" as const : "good" as const,
      result: humidity !== null && humidity <= 30 && veryDry ? "Check water needs" : "Use soil observations",
      timing: "Review root-zone moisture",
      detail: humidity !== null && humidity <= 30 && veryDry
        ? "Low humidity and little forecast rain can increase water loss. Check soil moisture before deciding whether to irrigate."
        : "Use observed soil moisture and crop stage to decide whether irrigation is needed.",
      Icon: Droplets,
    },
    {
      title: "Spraying & foliar work",
      status: windSpeed !== null && windSpeed > 15 ? "avoid" as const : currentTemperature !== null && currentTemperature >= 30 ? "caution" as const : "good" as const,
      result: windSpeed !== null && windSpeed > 15 ? "Delay if drift risk" : currentTemperature !== null && currentTemperature >= 30 ? "Cooler hours preferred" : "Check label & wind",
      timing: bestWindow,
      detail: windSpeed !== null && windSpeed > 15
        ? "Wind can increase drift. Follow product instructions and wait for suitable conditions."
        : "High heat can increase evaporation. Use product label directions and avoid spraying in unsuitable wind or heat.",
      Icon: Wind,
    },
    {
      title: "Harvest & sun-drying",
      status: rainProbabilityToday !== null && rainProbabilityToday <= 10 && (rainAmountToday ?? 0) <= 1 ? "good" as const : rainProbabilityToday !== null && rainProbabilityToday >= 60 ? "avoid" as const : "caution" as const,
      result: rainProbabilityToday !== null && rainProbabilityToday <= 10 ? "Drying window likely" : rainProbabilityToday !== null && rainProbabilityToday >= 60 ? "Protect harvested produce" : "Monitor rain timing",
      timing: `${forecastLabel(rainProbabilityToday, 0, "%")} rain chance today`,
      detail: "Check produce maturity and quality locally; cover harvested produce if rain develops.",
      Icon: Sun,
    },
    {
      title: "Planting & transplanting",
      status: rainProbabilityToday !== null && rainProbabilityToday >= 60 && (rainAmountToday ?? 0) >= 2 ? "caution" as const : "avoid" as const,
      result: rainProbabilityToday !== null && rainProbabilityToday >= 60 && (rainAmountToday ?? 0) >= 2 ? "Check soil before planting" : "Rain-fed planting may need moisture",
      timing: rainProbabilityToday !== null && rainProbabilityToday >= 60 ? "Rain may be possible" : "Confirm water availability",
      detail: "Forecast rain alone does not confirm suitable soil conditions. Check crop calendar, soil moisture, and local agronomic guidance.",
      Icon: Sprout,
    },
  ];
  const forecastMetrics = [
    { label: "Temperature", value: forecastLabel(current.temperature_2m, 1, "°C"), note: `Feels like ${forecastLabel(current.apparent_temperature, 1, "°C")} · Today ${forecastLabel(todayLow, 0, "°")} / ${forecastLabel(todayHigh, 0, "°C")}`, Icon: Thermometer, tone: "text-[#a45a27] bg-[#fff3e8]" },
    { label: "Humidity", value: forecastLabel(current.relative_humidity_2m, 0, "%"), note: "Relative humidity", Icon: Droplets, tone: "text-[#34768a] bg-[#eaf5f7]" },
    { label: "Precipitation", value: forecastLabel(current.precipitation, 1, " mm"), note: `${forecastLabel(dailyField(daily, "precipitation_probability_max", 0), 0, "%")} chance today`, Icon: CloudRain, tone: "text-[#426f9b] bg-[#edf4fb]" },
    { label: "Wind", value: forecastLabel(current.wind_speed_10m, 1, " km/h"), note: "At 10 metres", Icon: Wind, tone: "text-[#557c69] bg-[#edf5ef]" },
  ];
  return <>
    <Header eyebrow="Agronomy / Weather" title="Weather and alerts" description="Retrieve current conditions and forecasts for authorized farms or coordinates. Create targeted alerts with maker-checker approval." actions={selectableCrops.length > 0 ? <label className="field-label min-w-56">Target crop<select className="field-control" value={selectedCropId} onChange={(event) => { setSelectedCropId(event.target.value); setCropAdvisory(null); setCropAdvisoryError(null); }}><option value="">General farm weather</option>{selectableCrops.map((crop, index) => <option key={String(crop.id ?? index)} value={String(crop.id ?? "")}>{String(crop.name ?? crop.crop_name ?? "Crop")}{crop.season_name ? ` · ${String(crop.season_name)}` : ""}</option>)}</select></label> : undefined} />
    {Boolean(cropsError) && <p className="field-hint mb-3">Crop options could not be loaded: {errorMessage(cropsError)}</p>}
    <Feedback error={error} />
    <Panel title="Forecast lookup"><form onSubmit={fetchForecast} className="grid gap-4 md:grid-cols-3">
      <label className="field-label">Farm<select className="field-control" name="farm_id" value={selectedFarmId} onChange={(event) => { setSelectedFarmId(event.target.value); setSelectedCropId(""); setCropAdvisory(null); setCropAdvisoryError(null); }} disabled={!can(session, "farm.read") || Boolean(farmsError)}><option value="">Use coordinates instead…</option>{farms.map((farm) => <option key={String(farm.id)} value={String(farm.id)}>{`${String(farm.name ?? "Farm")}${farm.farmer_name ? ` · ${String(farm.farmer_name)}` : ""}`}</option>)}</select>{Boolean(farmsError) && <span role="alert" className="field-hint text-[#a34e3d]">Could not load farms: {errorMessage(farmsError)} <button type="button" className="font-semibold underline" onClick={() => { setFarmsError(null); setFarmsRetry((value) => value + 1); }}>Retry</button></span>}</label>
      <CoordinateFields value={coordinates} onChange={setCoordinates} />
      <div className="md:col-span-3"><button className="primary-button" disabled={busy === "forecast"}>{busy === "forecast" ? "Loading…" : "Get forecast"}</button></div>
    </form></Panel>
    {forecast && <>
      <section className="mb-5 overflow-hidden rounded-2xl border border-[#d9e6d6] bg-[linear-gradient(120deg,#f2f7ef,#fbf8ee)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#527354]">{selectedCropId ? `Farm weather overview · ${selectedCropName}` : "General farm weather"}</p>
            <h2 className="mt-2 text-xl font-semibold text-[#294a34]">{planningHeadline}</h2>
            <p className="mt-2 text-sm leading-6 text-[#526258]">{planningDescription}</p>
            <p className="mt-2 text-[10px] text-[#65766a]">General weather context only; verify crop stage, product labels, and local field conditions before acting.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <span className="status-pill status-wait">{dryDays} low-rain {dryDays === 1 ? "day" : "days"}</span>
            {maxTemperature !== null && <span className="status-pill status-neutral">High {maxTemperature.toFixed(1)}°C</span>}
          </div>
        </div>
      </section>

      {selectedCropId && <Panel title={`Crop-specific assessment · ${selectedCropName}`} actions={can(session, "advisory.generate") && selectedFarmId ? <button type="button" className="primary-button" disabled={busy === "crop-advisory" || Boolean(pendingCropAdvisoryId)} onClick={() => void requestCropAdvisory()}>{busy === "crop-advisory" ? "Requesting…" : pendingCropAdvisoryId ? "Preparing…" : "Get AI crop assessment"}</button> : undefined}>
        {can(session, "advisory.generate") && !selectedFarmId && <p className="mb-3 text-xs text-[var(--muted)]">Select a farm to include its recorded season and crop stage. Coordinate-only forecasts remain general.</p>}
        {!can(session, "advisory.generate") && <p className="mb-3 text-xs text-[var(--muted)]">Crop-specific AI assessment is not enabled for this account; the weather outlook below remains general.</p>}
        {Boolean(cropAdvisoryError) && <p role="alert" className="mb-3 text-xs text-[#a34e3d]">{errorMessage(cropAdvisoryError)}</p>}
        {cropAdvisory && String(cropAdvisory.crop_id) === selectedCropId ? <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{String(cropAdvisory.title ?? (["QUEUED", "GENERATING"].includes(String(cropAdvisory.status)) ? "Preparing crop-specific assessment…" : "Crop assessment"))}</h3><Status status={String(cropAdvisory.status ?? "QUEUED")} /></div>
          {cropAdvisory.status === "GENERATED" && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--muted)]">{String(cropAdvisory.content ?? "")}</p>}
          {cropAdvisory.status === "FAILED" && <p role="alert" className="mt-3 text-xs text-[#a34e3d]">{String(cropAdvisory.error ?? "The crop-specific assessment could not be generated. Try again later.")}</p>}
          {["QUEUED", "GENERATING"].includes(String(cropAdvisory.status)) && <p className="mt-2 text-xs text-[var(--muted)]">This can take a short time. The assessment uses recorded crop/season details and forecast data when available.</p>}
          <p className="mt-3 text-[10px] text-[var(--muted)]">AI-generated decision support, not a substitute for a local agronomist. Verify advice against field observations and product labels.</p>
        </div> : <p className="text-xs text-[var(--muted)]">Weather thresholds below are general. Request an AI assessment for guidance that considers this crop and its farm records.</p>}
      </Panel>}

      <Panel title="Current conditions">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>{value(forecast, "provider")} · Updated {date(forecast.observed_at)}</span>
          <span>Coordinates: {forecastLabel(forecast.latitude, 4)}, {forecastLabel(forecast.longitude, 4)}</span>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff3df] text-[#ad7625]"><CurrentIcon size={23} /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{condition.label}</p><p className="mt-1 text-xs text-[var(--muted)]">Observed {forecastTime(current.time)} · {forecastDate(current.time, { weekday: "long", month: "long", day: "numeric" })}</p></div>
          <span className="text-3xl font-semibold tracking-tight">{forecastLabel(current.temperature_2m, 1, "°C")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[...forecastMetrics, { label: "Daylight", value: formatDaylight(daylightMinutes), note: `Average ${formatDaylight(avgDaylight)}`, Icon: Sun, tone: "text-[#a1782d] bg-[#fff6dd]" }].map(({ label: metricLabel, value: metricValue, note, Icon, tone }) => <div key={metricLabel} className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
            <div className="flex items-center justify-between"><span className="text-xs font-medium text-[var(--muted)]">{metricLabel}</span><span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}><Icon size={16} /></span></div>
            <p className="mt-3 text-xl font-semibold">{metricValue}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{note}</p>
          </div>)}
        </div>
      </Panel>

      <Panel title="General weather-based activity outlook">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {matrix.map(({ title, status, result, timing, detail, Icon }) => <article key={title} className="rounded-xl border border-[var(--line)] p-4">
            <div className="flex items-start justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf4ed] text-[#527354]"><Icon size={18} /></span><span className={`status-pill ${status === "good" ? "status-good" : status === "avoid" ? "status-bad" : "status-wait"}`}>{status}</span></div>
            <h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs font-medium text-[#527354]">{result}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{timing}</p><p className="mt-3 text-xs leading-5 text-[var(--muted)]">{detail}</p>
          </article>)}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Hourly temperature" actions={hourDays.length > 1 ? <label className="field-label flex items-center gap-2">Day<select className="field-control" value={hourDay} onChange={(event) => setSelectedHourDay(event.target.value)}>{hourDays.map((day) => <option key={day} value={day}>{forecastDate(day)}</option>)}</select></label> : undefined}>
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
            <span>Coolest: {coolestHour ? `${forecastLabel(coolestHour.temperature, 1, "°")} at ${forecastTime(coolestHour.time)}` : "—"}</span>
            <span>Warmest: {hottestHour ? `${forecastLabel(hottestHour.temperature, 1, "°")} at ${forecastTime(hottestHour.time)}` : "—"}</span>
            <span>{heatHours} hours at or above 32°C</span>
          </div>
          {hourlyChartPoints.length ? <div className="overflow-x-auto">
            <svg viewBox="0 0 760 270" role="img" aria-label={`Hourly temperatures from ${hourlyMin} to ${hourlyMax} degrees Celsius`} className="h-64 min-w-[560px] w-full">
              {[0, 1, 2, 3].map((line) => { const y = 40 + line * 60; return <g key={line}><line x1="36" x2="724" y1={y} y2={y} stroke="#e5e9e3" strokeDasharray="3 4" /><text x="4" y={y + 4} fontSize="10" fill="#758078">{(hourlyMax - (line / 3) * hourlyRange).toFixed(0)}°</text></g>; })}
              {Number.isFinite(thresholdY) && thresholdY >= 40 && thresholdY <= 220 && <line x1="36" x2="724" y1={thresholdY} y2={thresholdY} stroke="#d29542" strokeDasharray="5 4" />}
              <path d={hourlyLinePath} fill="none" stroke="#648c68" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {hourlyChartPoints.map((point, index) => <g key={String(point.time)}><circle cx={point.x} cy={point.y} r="4" fill={point.temperature >= 32 ? "#d29542" : "#648c68"} />{index % 3 === 0 && <text x={point.x} y="244" textAnchor="middle" fontSize="9" fill="#758078">{forecastTime(point.time)}</text>}</g>)}
            </svg>
            <p className="text-[10px] text-[var(--muted)]">Morning cooler window estimate: {bestWindow}. Use this only as a forecast guide.</p>
          </div> : <p className="text-xs text-[var(--muted)]">Hourly temperature values are not available in this response.</p>}
        </Panel>
        <Panel title="Seven-day temperature & rain">
          {dailyChartRows.length ? <div className="overflow-x-auto">
            <svg viewBox="0 0 720 270" role="img" aria-label="Daily minimum and maximum temperatures with rain probability" className="h-64 min-w-[520px] w-full">
              {[0, 1, 2, 3].map((line) => { const y = 30 + line * 55; return <g key={line}><line x1="52" x2="672" y1={y} y2={y} stroke="#e5e9e3" strokeDasharray="3 4" /><text x="5" y={y + 4} fontSize="10" fill="#758078">{(dailyTempMax - (line / 3) * dailyTempRange).toFixed(0)}°</text></g>; })}
              {[100, 50, 0].map((rain) => <text key={rain} x="678" y={207 - rain * 1.5} fontSize="10" fill="#527c96">{rain}%</text>)}
              {dailyChartRows.map((row, index) => {
                const x = dailyChartRows.length > 1 ? 52 + (index / (dailyChartRows.length - 1)) * 620 : 360;
                const lowY = row.low === null ? null : 195 - ((row.low - dailyTempMin) / dailyTempRange) * 150;
                const highY = row.high === null ? null : 195 - ((row.high - dailyTempMin) / dailyTempRange) * 150;
                return <g key={String(row.day)}>
                  {row.low !== null && row.high !== null && <line x1={x} x2={x} y1={highY ?? 0} y2={lowY ?? 0} stroke="#d88a4a" strokeWidth="8" strokeLinecap="round" />}
                  {row.high !== null && <circle cx={x} cy={highY ?? 0} r="4" fill="#b86c39" />}
                  {row.low !== null && <circle cx={x} cy={lowY ?? 0} r="4" fill="#648c68" />}
                  <text x={x} y="230" textAnchor="middle" fontSize="10" fill="#758078">{forecastDate(row.day, { weekday: "short" })}</text>
                  <text x={x} y="253" textAnchor="middle" fontSize="9" fill="#527c96">{forecastLabel(row.rain, 0, "%")} rain</text>
                </g>;
              })}
              <path d={dailyRainPath} fill="none" stroke="#527c96" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
            <div className="flex flex-wrap gap-4 text-[10px] text-[var(--muted)]"><span className="text-[#b86c39]">● Daily high</span><span className="text-[#648c68]">● Daily low</span><span className="text-[#527c96]">- - Rain probability</span><span>Average temperature swing: {averageSwing === null ? "—" : `${averageSwing.toFixed(1)}°C`}</span></div>
          </div> : <p className="text-xs text-[var(--muted)]">Daily temperature values are not available in this response.</p>}
        </Panel>
      </div>

      <Panel title="Seven-day farm planner">
        <div className="overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Date</th><th>Conditions</th><th>Temperature</th><th>Rain outlook</th><th>Daylight</th><th>Weather-based planning</th></tr></thead><tbody>
          {dailyTimes.map((day, index) => {
            const dayCondition = weatherCondition(dailyField(daily, "weather_code", index));
            const DayIcon = dayCondition.Icon;
            const low = numberValue(dailyField(daily, "temperature_2m_min", index));
            const high = numberValue(dailyField(daily, "temperature_2m_max", index));
            const rainProbability = dailyField(daily, "precipitation_probability_max", index);
            const rainAmount = dailyField(daily, "precipitation_sum", index);
            return <tr key={String(day)}>
              <td><strong>{index === 0 ? "Today" : forecastDate(day)}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{forecastDate(day, { month: "short", day: "numeric", year: "numeric" })}</span></td>
              <td><span className="inline-flex items-center gap-2"><DayIcon size={16} className="text-[#74836e]" />{dayCondition.label}</span></td>
              <td>{forecastLabel(low, 1, "°")} <span className="text-[var(--muted)]">/</span> {forecastLabel(high, 1, "°C")}</td>
              <td>{forecastLabel(rainProbability, 0, "%")} <span className="text-[var(--muted)]">· {forecastLabel(rainAmount, 1, " mm")}</span></td>
              <td>{forecastTime(dailyField(daily, "sunrise", index))}<span className="mx-1 text-[var(--muted)]">–</span>{forecastTime(dailyField(daily, "sunset", index))}</td>
              <td className="min-w-64 text-xs leading-5">{farmWeatherAdvice(dailyField(daily, "weather_code", index), rainProbability, high)}</td>
            </tr>;
          })}
        </tbody></table>
          {!dailyTimes.length && <p className="py-6 text-center text-xs text-[var(--muted)]">Daily forecast values are not available in this response.</p>}
        </div>
      </Panel>
    </>}
    {canManageAlerts && <Panel title="Create targeted weather alert"><form onSubmit={createAlert} className="grid gap-4 md:grid-cols-2">
      <label className="field-label">Alert type<select name="alert_type" className="field-control">{["RAINFALL", "FLOOD", "HEAT", "DRY_SPELL", "PLANTING", "HARVEST", "PEST_DISEASE", "OTHER"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field-label">Severity<select name="severity" className="field-control">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field-label">Recipients<select name="target_type" className="field-control" value={targetType} onChange={(event) => { setTargetType(event.target.value); setTargetIds([]); }}>{audiences.map((item) => <option key={item}>{item}</option>)}</select></label>
      <RecipientSelector audienceType={targetType} selectedIds={targetIds} onChange={setTargetIds} inputName="target_ids" />
      {["STATE", "LGA", "WARD", "COMMUNITY"].includes(targetType) && <Field name="target_ids" label="Location IDs" hint="Comma-separated location UUIDs for geographic targeting." />}
      <Field name="starts_at" label="Starts at" type="datetime-local" required />
      <Field name="ends_at" label="Ends at" type="datetime-local" />
      <div className="md:col-span-2"><TextArea name="message" label="Alert message" required /></div>
      <div className="md:col-span-2"><button className="primary-button" disabled={busy === "alert"}>{busy === "alert" ? "Creating…" : "Create draft alert"}</button></div>
    </form></Panel>}
    <Panel title="Weather alert lifecycle">
      {alerts.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Alert</th><th>Severity</th><th>Target</th><th>Active window</th><th>Status</th><th>Actions</th></tr></thead><tbody>{alerts.map((alert) => {
        const id = value(alert, "id");
        const state = value(alert, "status");
        return <tr key={id}><td><strong>{value(alert, "alert_type")}</strong><p className="mt-1 max-w-xs text-[10px] text-[var(--muted)]">{value(alert, "message")}</p></td><td>{value(alert, "severity")}</td><td>{value(alert, "target_type")}</td><td>{date(alert.starts_at)}{alert.ends_at ? ` – ${date(alert.ends_at)}` : ""}</td><td><Status status={state} /></td><td><div className="flex flex-wrap gap-1">
          {state === "DRAFT" && can(session, "weather_alert.submit") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void alertAction(id, "submit")}>Submit</button>}
          {state === "SUBMITTED" && can(session, "weather_alert.approve") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void alertAction(id, "approve")}>Approve</button>}
          {state === "APPROVED" && can(session, "weather_alert.publish") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void alertAction(id, "publish")}>Publish</button>}
          {state === "PUBLISHED" && can(session, "weather_alert.manage") && <button className="secondary-button px-2 py-1 text-[10px]" disabled={Boolean(busy)} onClick={() => void alertAction(id, "archive")}>Archive</button>}
        </div></td></tr>;
      })}</tbody></table></div> : <p className="text-xs text-[var(--muted)]">No active weather alerts are available.</p>}
    </Panel>
  </>;
}

function AdvisoriesPage({ session, onToast }: Props) {
  const [items, setItems] = useState<Row[]>([]);
  const [farms, setFarms] = useState<Row[]>([]);
  const [personalizedItems, setPersonalizedItems] = useState<Row[]>([]);
  const [selectedFarm, setSelectedFarm] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [personalizedBusy, setPersonalizedBusy] = useState(false);
  const load = useCallback(async () => {
    try { setItems(await apiRequest<Row[]>("advisories")); setError(null); }
    catch (reason) { setError(reason); }
  }, []);
  const loadPersonalized = useCallback(async () => {
    if (!can(session, "advisory.generate")) return { advisories: [], farms: [] };
    const result = await apiRequest<Row>("advisories/personalized");
    const availableFarms = Array.isArray(result.farms) ? result.farms as Row[] : [];
    setFarms(availableFarms);
    setPersonalizedItems(Array.isArray(result.advisories) ? result.advisories as Row[] : []);
    setSelectedFarm((current) => current || String(availableFarms[0]?.id ?? ""));
    return result;
  }, [session]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    void Promise.resolve().then(loadPersonalized).catch((reason: unknown) => setError(reason));
  }, [loadPersonalized]);

  async function requestPersonalized() {
    if (!selectedFarm) return;
    setPersonalizedBusy(true);
    setError(null);
    try {
      const requested = await apiRequest<Row>("advisories/personalized", { method: "POST", body: { farm_id: selectedFarm } });
      const requestedId = String(requested.id);
      onToast("Personalized advisory generation queued.");
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const latest = await loadPersonalized();
        const advisory = Array.isArray(latest.advisories)
          ? (latest.advisories as Row[]).find((item) => String(item.id) === requestedId)
          : undefined;
        if (advisory && !["QUEUED", "GENERATING"].includes(String(advisory.status))) break;
      }
    } catch (reason) { setError(reason); }
    finally { setPersonalizedBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = { title: form.get("title"), category: form.get("category"), content: form.get("content") };
    setBusy(true);
    try {
      if (editing) await apiRequest(`advisories/${value(editing, "id")}`, { method: "PATCH", body });
      else await apiRequest("advisories", { method: "POST", body });
      setEditing(null);
      formElement.reset();
      onToast(editing ? "Draft advisory updated." : "Advisory draft created.");
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  async function action(id: string, command: string) {
    setBusy(true);
    try {
      await apiRequest(`advisories/${id}/${command}`, { method: "POST", body: {} });
      onToast(`Advisory ${command} complete.`);
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  return <>
    <Header eyebrow="Agronomy / Knowledge" title="Agricultural advisories" description="Farmers can request personalized AI guidance based on their farm, crop, activity, and local weather. Curated advisories remain independently reviewed before publication." />
    <Feedback error={error} />
    {can(session, "advisory.generate") && <Panel title="Personalized farm guidance">
      <p className="mb-4 text-xs leading-5 text-[var(--muted)]">Select an authorized farm to use its location, recorded crops and seasons, recent activities, and the latest available forecast. Guidance is AI-generated decision support, not a guarantee or substitute for local agronomic advice.</p>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="field-label min-w-56 flex-1">Farm
          <select className="field-control" value={selectedFarm} onChange={(event) => setSelectedFarm(event.target.value)}>
            {farms.map((farm) => <option key={String(farm.id)} value={String(farm.id)}>{value(farm, "name")}</option>)}
          </select>
        </label>
        <button type="button" className="primary-button" disabled={personalizedBusy || !selectedFarm} onClick={() => void requestPersonalized()}>
          {personalizedBusy ? "Generating…" : "Get personalized guidance"}
        </button>
      </div>
      {farms.length === 0 ? <p className="text-xs text-[var(--muted)]">No active farms are available to this account. Field officers can request guidance for assigned farmers’ farms.</p>
        : personalizedItems.length ? <div className="space-y-3">{personalizedItems.map((item) => <article key={String(item.id)} className="rounded-lg border border-[var(--line)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{value(item, "title", value(item, "status"))}</h3><p className="mt-1 text-[10px] text-[var(--muted)]">{value(item, "farm_name")} · {date(item.generated_at ?? item.created_at)}</p></div><Status status={value(item, "status")} /></div>
          {typeof item.content === "string" && item.content && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{item.content}</p>}
          {typeof item.error === "string" && item.error && <p role="alert" className="mt-3 text-xs text-[#a34e3d]">{item.error}</p>}
        </article>)}</div> : <p className="text-xs text-[var(--muted)]">No personalized recommendations yet.</p>}
    </Panel>}
    {can(session, "advisory.create") && <Panel title={editing ? "Edit advisory draft" : "Create advisory draft"} actions={editing ? <button className="secondary-button" onClick={() => setEditing(null)}>Cancel edit</button> : undefined}>
      <form key={value(editing ?? {}, "id", "new")} onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field name="title" label="Title" required defaultValue={editing ? value(editing, "title", "") : ""} />
        <Field name="category" label="Category" defaultValue={editing ? value(editing, "category", "") : ""} />
        <div className="md:col-span-2"><TextArea name="content" label="Advisory content" required defaultValue={editing ? value(editing, "content", "") : ""} /></div>
        <div className="md:col-span-2"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save draft" : "Create draft"}</button></div>
      </form>
    </Panel>}
    <Panel title="Published and managed advisories">
      {items.length ? <div className="space-y-3">{items.map((item) => {
        const id = value(item, "id");
        const state = value(item, "status");
        return <article key={id} className="rounded-lg border border-[var(--line)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{value(item, "title")}</h3><p className="mt-1 text-[10px] text-[var(--muted)]">{value(item, "category", "General")} · {date(item.published_at ?? item.created_at)}</p></div><Status status={state} /></div><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{value(item, "content")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {can(session, "advisory.update") && ["DRAFT", "RETURNED"].includes(state) && <button className="secondary-button" disabled={busy} onClick={() => setEditing(item)}>Edit draft</button>}
            {state === "DRAFT" && can(session, "advisory.submit") && <button className="secondary-button" disabled={busy} onClick={() => void action(id, "submit")}>Submit</button>}
            {state === "SUBMITTED" && can(session, "advisory.approve") && <button className="secondary-button" disabled={busy} onClick={() => void action(id, "approve")}>Approve</button>}
            {state === "APPROVED" && can(session, "advisory.publish") && <button className="secondary-button" disabled={busy} onClick={() => void action(id, "publish")}>Publish</button>}
            {["APPROVED", "PUBLISHED"].includes(state) && can(session, "advisory.archive") && <button className="secondary-button" disabled={busy} onClick={() => void action(id, "archive")}>Archive</button>}
          </div>
        </article>;
      })}</div> : <p className="text-xs text-[var(--muted)]">No advisory content is available.</p>}
    </Panel>
  </>;
}

export default function CommunicationPages(props: Props) {
  const section = props.path.split("/").filter(Boolean)[0];
  if (section === "notifications") return <NotificationsPage {...props} />;
  if (section === "sms-campaigns") return <SMSCampaignsPage {...props} />;
  if (section === "weather") return <WeatherPage {...props} />;
  if (section === "advisories") return <AdvisoriesPage {...props} />;
  return null;
}
