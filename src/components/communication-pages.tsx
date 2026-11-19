"use client";

import { RefreshCw } from "lucide-react";
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
  const [farmsError, setFarmsError] = useState<unknown>(null);
  const [farmsRetry, setFarmsRetry] = useState(0);
  const [coordinates, setCoordinates] = useState({ latitude: "", longitude: "" });
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

  async function fetchForecast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    const farmId = String(form.get("farm_id") ?? "").trim();
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
  const current = forecast?.data && typeof forecast.data === "object" ? forecast.data as Row : {};
  const days = (current.daily && typeof current.daily === "object" ? current.daily as Row : {});
  return <>
    <Header eyebrow="Agronomy / Weather" title="Weather and alerts" description="Retrieve current conditions and forecasts for authorized farms or coordinates. Create targeted alerts with maker-checker approval." />
    <Feedback error={error} />
    <Panel title="Forecast lookup"><form onSubmit={fetchForecast} className="grid gap-3 md:grid-cols-3">
      <label className="field-label">Farm<select className="field-control" name="farm_id" defaultValue="" disabled={!can(session, "farm.read") || Boolean(farmsError)}><option value="">Use coordinates instead…</option>{farms.map((farm) => <option key={String(farm.id)} value={String(farm.id)}>{`${String(farm.name ?? "Farm")}${farm.farmer_name ? ` · ${String(farm.farmer_name)}` : ""}`}</option>)}</select>{Boolean(farmsError) && <span role="alert" className="field-hint text-[#a34e3d]">Could not load farms: {errorMessage(farmsError)} <button type="button" className="font-semibold underline" onClick={() => { setFarmsError(null); setFarmsRetry((value) => value + 1); }}>Retry</button></span>}</label>
      <CoordinateFields value={coordinates} onChange={setCoordinates} />
      <div className="md:col-span-3"><button className="primary-button" disabled={busy === "forecast"}>{busy === "forecast" ? "Loading…" : "Get forecast"}</button></div>
    </form></Panel>
    {forecast && <Panel title="Forecast data"><p className="mb-3 text-xs text-[var(--muted)]">Provider: {value(forecast, "provider")} · Updated: {date(forecast.observed_at)}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-[11px] leading-5">{JSON.stringify({ current: current.current, hourly: current.hourly, daily: days }, null, 2)}</pre></Panel>}
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
    {can(session, "advisory.generate") && <Panel title="Your personalized farm guidance">
      <p className="mb-4 text-xs leading-5 text-[var(--muted)]">Recommendations use your farm location, recorded crops and seasons, recent activities, and the latest available forecast. Guidance is AI-generated decision support, not a guarantee or substitute for local agronomic advice.</p>
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
      {farms.length === 0 ? <p className="text-xs text-[var(--muted)]">Add an active farm before requesting personalized guidance.</p>
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
