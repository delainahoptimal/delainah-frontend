"use client";

import {
  ArrowLeft, ArrowRight, Check, ClipboardList, LoaderCircle, Plus, RefreshCw,
  Tractor, Wheat,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiRequest, errorMessage } from "@/lib/api";
import type { RoleGrant, SessionUser } from "@/lib/api";
import { CoordinateFields } from "@/components/location-inputs";
import OperationalOptionSelect from "@/components/operational-option-select";

type Row = Record<string, unknown>;
type SessionInfo = { user: SessionUser; permissions: string[]; permissionError?: boolean; roles: RoleGrant[] };
const operationalOptionKinds = [
  ["SERVICE_CATEGORY", "Service categories"],
  ["PRICING_METHOD", "Pricing methods"],
  ["MACHINERY_TYPE", "Machinery types"],
  ["MAINTENANCE_TYPE", "Fleet maintenance types"],
  ["VENDOR", "Vendors"],
  ["PRODUCE_QUALITY_GRADE", "Produce quality grades"],
] as const;

function permitted(session: SessionInfo, permission: string) {
  return !session.permissionError && session.permissions.includes(permission);
}

function hasOperationsScope(session: SessionInfo) {
  return session.roles.some((role) => role.scopes?.some((scope) => scope === "OPS" || scope === "ALL"));
}

function isSuperAdmin(session: SessionInfo) {
  return session.user.user_type === "SUPER_ADMIN" || session.roles.some((role) => role.code === "SUPER_ADMIN");
}

function isFieldOfficer(session: SessionInfo) {
  return session.roles.some((role) => role.code === "FIELD_OFFICER")
    && !session.roles.some((role) => role.code === "ADMIN" || role.code === "SUPER_ADMIN")
    && session.user.user_type !== "SUPER_ADMIN";
}

function getRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === "object" && "results" in payload) {
    const results = (payload as { results?: unknown }).results;
    return Array.isArray(results) ? results as Row[] : [];
  }
  return [];
}

function label(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const row = value as Row;
    return String(row.name ?? row.email ?? row.id ?? "—");
  }
  return String(value);
}

function cash(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(amount)
    : "—";
}

function titleCase(value: unknown) {
  return label(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PageTitle({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><div className="eyebrow">{eyebrow}</div><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.02em] sm:text-[30px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p></div>
    {actions}
  </div>;
}

function Notice({ error, success }: { error: unknown; success: string }) {
  if (error) return <div role="alert" className="my-4 rounded-lg border border-[#efc9c0] bg-[#fff6f3] px-4 py-3 text-xs leading-5 text-[#964d3e]">{errorMessage(error)}</div>;
  if (success) return <div role="status" className="my-4 rounded-lg border border-[#d1e5d3] bg-[#f0f8f0] px-4 py-3 text-xs leading-5 text-[#39714b]">{success}</div>;
  return null;
}

function Loading({ message = "Loading records…" }: { message?: string }) {
  return <div className="flex items-center gap-2 py-8 text-xs text-[var(--muted)]"><LoaderCircle size={15} className="animate-spin" />{message}</div>;
}

function DataTable({ columns, rows, empty }: { columns: { key: string; label: string; status?: boolean; money?: boolean }[]; rows: Row[]; empty: string }) {
  if (!rows.length) return <div className="px-5 py-8 text-center text-xs text-[var(--muted)]">{empty}</div>;
  return <div className="overflow-x-auto"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>
    {rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => {
      const value = row[column.key];
      return <td key={column.key}>{column.status ? <span className={`status-pill ${["COMPLETED", "PUBLISHED", "CONFIRMED", "AVAILABLE"].includes(String(value)) ? "status-good" : ["REJECTED", "CLOSED", "DECOMMISSIONED"].includes(String(value)) ? "status-bad" : "status-wait"}`}>{titleCase(value)}</span> : column.money ? cash(value) : label(value)}</td>;
    })}</tr>)}
  </tbody></table></div>;
}

function TextField({ name, label: fieldLabel, type = "text", required = false, hint, defaultValue, disabled = false }: { name: string; label: string; type?: string; required?: boolean; hint?: string; defaultValue?: string; disabled?: boolean }) {
  return <label className="field-label">{fieldLabel}<input className="field-control" name={name} type={type} required={required} disabled={disabled} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} defaultValue={defaultValue} />{hint && <span className="field-hint">{hint}</span>}</label>;
}

function SelectField({ name, label: fieldLabel, rows, required = false, includeBlank = true }: { name: string; label: string; rows: Row[]; required?: boolean; includeBlank?: boolean }) {
  return <label className="field-label">{fieldLabel}<select className="field-control" name={name} required={required} defaultValue=""><>{includeBlank && <option value="">Select…</option>}{rows.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.service_name ?? row.farm_name ?? row.asset_code ?? row.offer_reference ?? row.id)}</option>)}</></select></label>;
}

function SectionCard({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="surface-panel mb-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{description}</p>}</div>{actions}</div>{children}</section>;
}

function ModuleLinks({ session }: { session: SessionInfo }) {
  const links = [
    { href: "/service-requests", title: "Service requests", permission: ["service_request.read", "service_request.create", "service.manage", "service_payment.verify"], icon: ClipboardList, note: "Request, schedule, and complete farm services." },
    { href: "/machinery", title: "Machinery", permission: ["machinery.read", "machinery.create", "machinery.maintenance", "machinery.utilization.read"], icon: Tractor, note: "Track machinery, maintenance, utilization, and assignments." },
    { href: "/produce", title: "Produce listings", permission: ["produce.read", "produce.create"], icon: Wheat, note: "Manage farmer produce offers." },
    { href: "/procurement", title: "Procurement", permission: ["procurement.read", "procurement.create"], icon: ClipboardList, note: "Manage orders, settlements, and forecasts." },
  ].filter((link) => link.permission.some((permission) => permitted(session, permission)) || (link.href === "/service-requests" && isSuperAdmin(session)));
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{links.map(({ href, title, icon: Icon, note }) => <Link key={href} href={href} className="surface-panel group p-4 transition hover:-translate-y-0.5 hover:border-[#b8cdbd]"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf5ee] text-[var(--leaf)]"><Icon size={17} /></span><span className="mt-3 block text-sm font-semibold">{title}<ArrowRight size={13} className="ml-1 inline transition group-hover:translate-x-1" /></span><span className="mt-1 block text-[11px] leading-5 text-[var(--muted)]">{note}</span></Link>)}</div>;
}

export default function OperationsPages({ path, session, onToast }: { path: string; session: SessionInfo; onToast: (message: string) => void }) {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "operations" && segments[1] === "catalogues") return <OperationalOptionsPage session={session} onToast={onToast} />;
  if (segments[0] === "operations" && segments[1] === "locations") return <LocationCataloguePage session={session} onToast={onToast} />;
  if (segments[0] === "service-requests") {
    return segments.length > 1 ? <ServiceRequestDetail id={segments[1]} session={session} onToast={onToast} /> : <ServiceRequestsPage session={session} onToast={onToast} />;
  }
  if (segments[0] === "machinery") return <MachineryPage session={session} onToast={onToast} />;
  if (segments[0] === "produce") return <ProducePage session={session} onToast={onToast} />;
  if (segments[0] === "procurement" && segments[1] === "forecast") return <ForecastPage session={session} />;
  if (segments[0] === "procurement") return segments.length > 1 ? <ProcurementDetail id={segments[1]} session={session} onToast={onToast} /> : <ProcurementPage session={session} onToast={onToast} />;
  return <><PageTitle eyebrow="Farm operations" title="Farm operations" description="Coordinate field services, equipment, produce sales, and procurement in one workspace." /><ModuleLinks session={session} /></>;
}

function OperationalOptionsPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [options, setOptions] = useState<Row[]>([]);
  const [editingOption, setEditingOption] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const isAdmin = isSuperAdmin(session);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOptions(getRows(await apiRequest<unknown>("operational-options?include_inactive=true")));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, load]);

  async function createOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const option = await apiRequest<Row>("operational-options", {
        method: "POST",
        body: { kind: form.get("kind"), value: form.get("value") },
      });
      setSuccess(`${String(option.value)} added.`);
      formElement.reset();
      onToast("Operational choice added.");
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  async function deactivate(option: Row) {
    setBusy(true);
    setError(null);
    try {
      const action = option.active ? "deactivate" : "activate";
      await apiRequest(`operational-options/${String(option.id)}/${action}`, { method: "POST", body: {} });
      onToast(`${String(option.value)} ${action}d.`);
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  async function updateOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOption) return;
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(`operational-options/${String(editingOption.id)}`, {
        method: "PATCH",
        body: { kind: form.get("kind"), value: form.get("value") },
      });
      onToast("Operational choice updated.");
      setEditingOption(null);
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  if (!isAdmin) return <Denied permission="Super Admin" title="Operational choices" />;
  return <>
    <PageTitle eyebrow="Administration / Operational choices" title="Operational choices" description="Manage the selectable lists used by services, machinery, fleet maintenance, and produce workflows." />
    <Notice error={error} success={success} />
    <SectionCard title="Add a choice" description="New active choices become available in relevant dropdowns for all users.">
      <form onSubmit={createOption} className="grid gap-3 p-5 sm:grid-cols-[minmax(200px,0.7fr)_minmax(220px,1fr)_auto] sm:items-end">
        <label className="field-label">List<select className="field-control" name="kind" required defaultValue=""><option value="">Choose list…</option>{operationalOptionKinds.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <TextField name="value" label="Choice name" required />
        <button disabled={busy} className="primary-button">{busy ? "Adding…" : "Add choice"}</button>
      </form>
    </SectionCard>
    {loading ? <Loading /> : operationalOptionKinds.map(([kind, label]) => {
      const rows = options.filter((option) => option.kind === kind);
      return <SectionCard key={kind} title={label}>
        {rows.length ? <div className="divide-y divide-[var(--line)] px-5">{rows.map((option) => <div key={String(option.id)} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">{editingOption?.id === option.id ? <form onSubmit={updateOption} className="grid w-full gap-3 sm:grid-cols-[minmax(180px,0.7fr)_minmax(180px,1fr)_auto_auto] sm:items-end"><label className="field-label">List<select className="field-control" name="kind" defaultValue={String(option.kind)} required>{operationalOptionKinds.map(([optionKind, optionLabel]) => <option key={optionKind} value={optionKind}>{optionLabel}</option>)}</select></label><TextField name="value" label="Choice name" required defaultValue={String(option.value)} /><button className="primary-button" disabled={busy}>Save</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditingOption(null)}>Cancel</button></form> : <><span>{String(option.value)}</span><div className="flex items-center gap-2"><span className={`status-pill ${option.active ? "status-good" : "status-neutral"}`}>{option.active ? "Active" : "Inactive"}</span><button className="secondary-button min-h-8" disabled={busy} onClick={() => setEditingOption(option)}>Edit</button><button className={option.active ? "danger-button min-h-8" : "secondary-button min-h-8"} disabled={busy} onClick={() => void deactivate(option)}>{option.active ? "Deactivate" : "Reactivate"}</button></div></>}</div>)}</div> : <p className="px-5 py-5 text-xs text-[var(--muted)]">No choices added yet.</p>}
      </SectionCard>;
    })}
  </>;
}

function LocationCataloguePage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [states, setStates] = useState<Row[]>([]);
  const [lgas, setLgas] = useState<Row[]>([]);
  const [wards, setWards] = useState<Row[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedLga, setSelectedLga] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedWardCoordinates, setSelectedWardCoordinates] = useState({ latitude: "", longitude: "" });
  const [newWardCoordinates, setNewWardCoordinates] = useState({ latitude: "", longitude: "" });
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const isAdmin = isSuperAdmin(session);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    apiRequest<unknown>("geography/states")
      .then((payload) => { if (active) setStates(getRows(payload)); })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [isAdmin, refresh]);

  useEffect(() => {
    if (!selectedState) return;
    let active = true;
    apiRequest<unknown>(`geography/states/${selectedState}/lgas`)
      .then((payload) => {
        if (!active) return;
        const items = getRows(payload);
        setLgas(items);
        setSelectedLga((current) => items.some((item) => String(item.id) === current) ? current : "");
      })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [selectedState, refresh]);

  useEffect(() => {
    if (!selectedLga) return;
    let active = true;
    apiRequest<unknown>(`geography/lgas/${selectedLga}/wards`)
      .then((payload) => {
        if (!active) return;
        const items = getRows(payload);
        setWards(items);
        setSelectedWard((current) => items.some((item) => String(item.id) === current) ? current : "");
      })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [selectedLga, refresh]);

  const selectedStateRow = states.find((item) => String(item.id) === selectedState);
  const selectedLgaRow = lgas.find((item) => String(item.id) === selectedLga);
  const selectedWardRow = wards.find((item) => String(item.id) === selectedWard);

  async function saveLocation(event: FormEvent<HTMLFormElement>, endpoint: string, method: "POST" | "PATCH", successMessage: string) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body: Row = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()]));
    if ("latitude" in body) body.latitude = body.latitude ? body.latitude : null;
    if ("longitude" in body) body.longitude = body.longitude ? body.longitude : null;
    try {
      await apiRequest(endpoint, { method, body });
      onToast(successMessage);
      setRefresh((value) => value + 1);
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  if (!isAdmin) return <Denied permission="Super Admin" title="Geography data" />;
  return <>
    <PageTitle eyebrow="Administration / Geography data" title="Geography data" description="Manage the states, local government areas, and wards used across registration and farm forms. Existing records keep their linked locations when names or codes are edited." />
    <Notice error={error} success="" />
    <SectionCard title="States">
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
        <label className="field-label">Select state<select className="field-control" value={selectedState} onChange={(event) => { setSelectedState(event.target.value); setSelectedLga(""); setSelectedWard(""); setLgas([]); setWards([]); }}><option value="">Choose a state…</option>{states.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
        {selectedStateRow && <form key={String(selectedStateRow.id)} onSubmit={(event) => void saveLocation(event, `geography/states/${String(selectedStateRow.id)}`, "PATCH", "State updated.")} className="grid gap-3 sm:grid-cols-2 sm:items-end"><TextField name="name" label="State name" required defaultValue={String(selectedStateRow.name)} /><TextField name="code" label="State code" required defaultValue={String(selectedStateRow.code)} /><button className="primary-button sm:col-span-2" disabled={busy}>Save state</button></form>}
        <form onSubmit={(event) => void saveLocation(event, "geography/states", "POST", "State added.")} className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2 sm:items-end lg:col-span-2"><TextField name="name" label="New state name" required /><TextField name="code" label="State code" required /><button className="secondary-button sm:col-span-2" disabled={busy}>Add state</button></form>
      </div>
    </SectionCard>
    <SectionCard title="Local government areas">
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
        <label className="field-label">Select LGA<select className="field-control" value={selectedLga} disabled={!selectedState} onChange={(event) => { setSelectedLga(event.target.value); setSelectedWard(""); setWards([]); }}><option value="">Choose an LGA…</option>{lgas.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
        {selectedLgaRow && <form key={String(selectedLgaRow.id)} onSubmit={(event) => void saveLocation(event, `geography/lgas/${String(selectedLgaRow.id)}`, "PATCH", "LGA updated.")} className="grid gap-3 sm:grid-cols-2 sm:items-end"><TextField name="name" label="LGA name" required defaultValue={String(selectedLgaRow.name)} /><TextField name="code" label="LGA code" required defaultValue={String(selectedLgaRow.code)} /><button className="primary-button sm:col-span-2" disabled={busy}>Save LGA</button></form>}
        <form onSubmit={(event) => void saveLocation(event, `geography/states/${selectedState}/lgas`, "POST", "LGA added.")} className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2 sm:items-end lg:col-span-2"><TextField name="name" label="New LGA name" required disabled={!selectedState} /><TextField name="code" label="LGA code" required disabled={!selectedState} /><button className="secondary-button sm:col-span-2" disabled={busy || !selectedState}>Add LGA</button></form>
      </div>
    </SectionCard>
    <SectionCard title="Wards">
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
        <label className="field-label">Select ward<select className="field-control" value={selectedWard} disabled={!selectedLga} onChange={(event) => {
          const wardId = event.target.value;
          const ward = wards.find((item) => String(item.id) === wardId);
          setSelectedWard(wardId);
          setSelectedWardCoordinates({
            latitude: String(ward?.latitude ?? ""),
            longitude: String(ward?.longitude ?? ""),
          });
        }}><option value="">Choose a ward…</option>{wards.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
        {selectedWardRow && <form key={String(selectedWardRow.id)} onSubmit={(event) => void saveLocation(event, `geography/wards/${String(selectedWardRow.id)}`, "PATCH", "Ward updated.")} className="grid gap-3 sm:grid-cols-2 sm:items-end"><TextField name="name" label="Ward name" required defaultValue={String(selectedWardRow.name)} /><TextField name="code" label="Ward code" required defaultValue={String(selectedWardRow.code)} /><CoordinateFields value={selectedWardCoordinates} onChange={setSelectedWardCoordinates} /><button className="primary-button sm:col-span-2" disabled={busy}>Save ward</button></form>}
        <form onSubmit={(event) => void saveLocation(event, `geography/lgas/${selectedLga}/wards`, "POST", "Ward added.")} className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2 sm:items-end lg:col-span-2"><TextField name="name" label="New ward name" required /><TextField name="code" label="Ward code" required /><CoordinateFields value={newWardCoordinates} onChange={setNewWardCoordinates} /><button className="secondary-button sm:col-span-2" disabled={busy || !selectedLga}>Add ward</button></form>
      </div>
    </SectionCard>
  </>;
}

function ServiceRequestsPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [requests, setRequests] = useState<Row[]>([]);
  const [services, setServices] = useState<Row[]>([]);
  const [farmers, setFarmers] = useState<Row[]>([]);
  const [farms, setFarms] = useState<Row[]>([]);
  const [crops, setCrops] = useState<Row[]>([]);
  const [seasons, setSeasons] = useState<Row[]>([]);
  const [paymentEvidence, setPaymentEvidence] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serviceBusy, setServiceBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [serviceSuccess, setServiceSuccess] = useState("");
  const [editingService, setEditingService] = useState<Row | null>(null);
  const canRead = permitted(session, "service_request.read");
  const canCreate = permitted(session, "service_request.create");
  const canManageServices = permitted(session, "service.manage") || isSuperAdmin(session);
  const canVerifyPayments = permitted(session, "service_payment.verify");
  const fieldOfficer = isFieldOfficer(session);
  const [selectedFarmerId, setSelectedFarmerId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const needsFarmerSelection = canCreate && session.user.user_type !== "FARMER";
      const [requestData, serviceData, farmerData, farmData, cropData, seasonData, evidenceData] = await Promise.all([
        canRead ? apiRequest<unknown>("service-requests/service-requests") : Promise.resolve([]),
        canRead || canCreate || canManageServices ? apiRequest<unknown>("services") : Promise.resolve([]),
        needsFarmerSelection ? apiRequest<unknown>("farmers/farmers?page=1&page_size=100") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("farms/farms") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("crops/crops") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("seasons") : Promise.resolve([]),
        canVerifyPayments ? apiRequest<unknown>("service-payments/evidence") : Promise.resolve([]),
      ]);
      setRequests(getRows(requestData)); setServices(getRows(serviceData)); setFarmers(getRows(farmerData)); setFarms(getRows(farmData)); setCrops(getRows(cropData)); setSeasons(getRows(seasonData));
      setPaymentEvidence(getRows(evidenceData));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [canRead, canCreate, canManageServices, canVerifyPayments, session.user.user_type]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== ""));
    if (session.user.user_type === "FARMER") delete body.farmer;
    if (fieldOfficer) body.submit = "true";
    try {
      const result = await apiRequest<Row>("service-requests/service-requests", { method: "POST", body });
      setSuccess(`Service request ${String(result.request_reference ?? "")} created.`);
      formElement.reset(); setSelectedFarmerId(""); await load(); onToast("Service request created.");
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setServiceBusy(true); setError(null); setServiceSuccess("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== ""));
    try {
      const result = await apiRequest<Row>("services", { method: "POST", body });
      setServiceSuccess(`${String(result.name ?? "Service")} added to the catalogue.`);
      formElement.reset(); await load(); onToast("Service created.");
    } catch (reason) { setError(reason); }
    finally { setServiceBusy(false); }
  }

  async function updateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingService) return;
    setServiceBusy(true); setError(null);
    const form = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try {
      await apiRequest("services", { method: "PATCH", body: { ...form, id: editingService.id } });
      setEditingService(null); setServiceSuccess(`${String(editingService.name)} updated.`); await load();
    } catch (reason) { setError(reason); }
    finally { setServiceBusy(false); }
  }

  async function verifyPayment(evidence: Row, decision: "VERIFY" | "REJECT") {
    const reason = window.prompt(decision === "VERIFY" ? "Verification note" : "Reason for rejecting this payment");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      await apiRequest(`service-payments/evidence/${String(evidence.id)}/verify`, {
        method: "POST",
        body: { decision, reason: reason.trim() },
      });
      onToast(`Manual payment ${decision === "VERIFY" ? "verified" : "rejected"}.`);
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  if (!canRead && !canCreate && !canManageServices) return <Denied permission="service_request.read, service_request.create, or service.manage" title="Service requests" />;
  return <>
    <PageTitle eyebrow="Services / Field operations" title="Service requests" description="Request farm services, track approvals and scheduling, and follow work through completion." actions={<div className="flex gap-2"><Link className="secondary-button" href="/offline-sync">Offline logging</Link><button className="icon-button" onClick={() => void load()} aria-label="Refresh service requests"><RefreshCw size={14} /></button></div>} />
    <Notice error={error} success="" />
    {canRead && <SectionCard title="Service request queue" description="Your results are limited by your role and assigned-farmer scope.">
      {loading ? <Loading /> : <DataTable columns={[{ key: "request_reference", label: "Request" }, { key: "farmer_name", label: "Farmer" }, { key: "farm_name", label: "Farm" }, { key: "service_name", label: "Service" }, { key: "scheduled_date", label: "Scheduled" }, { key: "estimated_cost", label: "Estimate", money: true }, { key: "status", label: "Status", status: true }]} rows={requests} empty="No service requests are available." />}
      {requests.length > 0 && <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-5 py-3">{requests.map((request) => <Link key={String(request.id)} href={`/service-requests/${String(request.id)}`} className="secondary-button">{String(request.request_reference ?? "View request")}<ArrowRight size={13} /></Link>)}</div>}
    </SectionCard>}
    {canVerifyPayments && <SectionCard title="Manual payment verification" description="Payment evidence is reviewed by a different user from the submitter.">
      {paymentEvidence.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Request</th><th>Amount</th><th>Reference</th><th>Evidence</th><th>Submitted by</th><th>Review</th></tr></thead><tbody>{paymentEvidence.map((evidence) => <tr key={String(evidence.id)}><td className="mono">{String(evidence.service_request)}</td><td>{cash(evidence.amount)}</td><td>{label(evidence.declared_reference)}</td><td><Link className="underline" href={`/documents/${String(evidence.evidence_document)}`}>{label(evidence.evidence_document_name)}</Link></td><td>{label(evidence.submitted_by_email)}</td><td><div className="flex gap-2"><button disabled={busy} className="secondary-button min-h-8" onClick={() => void verifyPayment(evidence, "VERIFY")}>Verify</button><button disabled={busy} className="danger-button min-h-8" onClick={() => void verifyPayment(evidence, "REJECT")}>Reject</button></div></td></tr>)}</tbody></table></div> : <p className="px-5 py-5 text-sm text-[var(--muted)]">No pending manual payment evidence.</p>}
    </SectionCard>}
    {(canRead || canManageServices) && <SectionCard title="Service catalogue" description="Active services and their pricing.">
      {services.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Service</th><th>Category</th><th>Pricing</th><th>Unit price</th>{canManageServices && <th>Manage</th>}</tr></thead><tbody>{services.map((service) => <tr key={String(service.id)}><td>{label(service.name)}</td><td>{label(service.category)}</td><td>{titleCase(service.pricing_method)}</td><td>{cash(service.default_unit_price)}</td>{canManageServices && <td><button className="secondary-button min-h-8" onClick={() => setEditingService(service)}>Edit pricing</button></td>}</tr>)}</tbody></table></div> : <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No active services are listed.</p>}
    </SectionCard>}
    {editingService && canManageServices && <SectionCard title={`Edit ${String(editingService.name)}`} actions={<button className="secondary-button" onClick={() => setEditingService(null)}>Cancel</button>}>
      <form onSubmit={updateService} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
        <TextField name="name" label="Service name" required defaultValue={String(editingService.name ?? "")} />
        <OperationalOptionSelect kind="SERVICE_CATEGORY" name="category" label="Service category" defaultValue={String(editingService.category ?? "")} isSuperAdmin={isSuperAdmin(session)} />
        <OperationalOptionSelect kind="PRICING_METHOD" name="pricing_method" label="Pricing method" required defaultValue={String(editingService.pricing_method ?? "")} isSuperAdmin={isSuperAdmin(session)} />
        <TextField name="default_unit_price" label="Unit price" type="number" defaultValue={String(editingService.default_unit_price ?? "")} />
        <TextField name="currency" label="Currency" defaultValue={String(editingService.currency ?? "NGN")} />
        <label className="field-label sm:col-span-2 xl:col-span-3">Description<textarea className="field-control h-20 py-2" name="description" defaultValue={String(editingService.description ?? "")} /></label>
        <div className="sm:col-span-2 xl:col-span-3"><button disabled={serviceBusy} className="primary-button">Save catalogue changes</button></div>
      </form>
    </SectionCard>}
    {canManageServices && <SectionCard title="Add a service" description="Create an active service that farmers can request.">
      {serviceSuccess && <Notice error={null} success={serviceSuccess} />}
      <form onSubmit={createService} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
        <TextField name="name" label="Service name" required />
        <OperationalOptionSelect kind="SERVICE_CATEGORY" name="category" label="Service category" isSuperAdmin={isSuperAdmin(session)} />
        <OperationalOptionSelect kind="PRICING_METHOD" name="pricing_method" label="Pricing method" required isSuperAdmin={isSuperAdmin(session)} />
        <TextField name="default_unit_price" label="Default unit price" type="number" />
        <TextField name="currency" label="Currency" defaultValue="NGN" />
        <label className="field-label sm:col-span-2 xl:col-span-3">Description<textarea className="field-control h-20 py-2" name="description" /></label>
        <div className="sm:col-span-2 xl:col-span-3"><button disabled={serviceBusy} className="primary-button"><Plus size={14} />{serviceBusy ? "Creating…" : "Create service"}</button></div>
      </form>
    </SectionCard>}
    {canCreate && <SectionCard title="Create a service request" description="Farmers can request service for their own farm. Field Officers must select the assigned farmer.">
      {success && <Notice error={null} success={success} />}
      <form onSubmit={createRequest} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {session.user.user_type !== "FARMER" && <label className="field-label">Farmer{fieldOfficer ? "" : " (optional for customer requests)"}<select className="field-control" name="farmer" required={fieldOfficer} value={selectedFarmerId} onChange={(event) => setSelectedFarmerId(event.target.value)}><option value="">{fieldOfficer ? "Select an assigned farmer…" : "Customer without farmer profile…"}</option>{farmers.map((farmer) => <option key={String(farmer.id)} value={String(farmer.id)}>{`${farmer.farmer_number ?? farmer.provisional_reference ?? "Farmer"} · ${[farmer.first_name, farmer.last_name].filter(Boolean).map(String).join(" ") || String(farmer.email ?? "—")}`}</option>)}</select></label>}
            {!fieldOfficer && session.user.user_type !== "FARMER" && <TextField name="customer_name" label="Customer name" hint="Required when no farmer profile is selected." />}
            {!fieldOfficer && session.user.user_type !== "FARMER" && <TextField name="customer_phone" label="Customer phone" hint="Required when no farmer profile is selected." />}
            <SelectField name="farm" label={fieldOfficer ? "Farm" : "Farm (optional for customer requests)"} rows={farms.filter((farm) => !fieldOfficer || !selectedFarmerId || String(farm.farmer_id) === selectedFarmerId)} required={fieldOfficer} />
        <SelectField name="service" label="Service" rows={services} required />
        <SelectField name="crop" label="Crop (optional)" rows={crops} />
        <SelectField name="season" label="Season (optional)" rows={seasons} />
        <TextField name="requested_acreage" label="Requested acreage" type="number" />
        <TextField name="requested_date" label="Requested date" type="date" />
        <TextField name="location" label="Location or access notes" />
        <label className="field-label sm:col-span-2 xl:col-span-3">Additional notes<textarea className="field-control h-20 py-2" name="notes" /></label>
        <div className="sm:col-span-2 xl:col-span-3"><button disabled={busy} className="primary-button"><Plus size={14} />{busy ? "Creating…" : "Create request"}</button></div>
      </form>
    </SectionCard>}
  </>;
}

function ServiceRequestDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const [request, setRequest] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [machinery, setMachinery] = useState<Row[]>([]);
  const [operators, setOperators] = useState<Row[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Row[]>([]);
  const [evidenceDocumentId, setEvidenceDocumentId] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const canReadHistory = permitted(session, "service_request.history");
  const canAssignMachinery = permitted(session, "service_request.assign");
  const canReadPaymentDocumentTypes = permitted(session, "service_payment.manual_submit") && permitted(session, "document_type.read");
  const can = (permission: string) => permitted(session, permission);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiRequest<Row>(`service-requests/service-requests/${id}`);
      setRequest(data);
      if (canReadPaymentDocumentTypes) {
        setDocumentTypes(getRows(await apiRequest<unknown>("document-types")));
      }
      if (canReadHistory) {
        try { setHistory(getRows(await apiRequest<unknown>(`service-requests/service-requests/${id}/history`))); }
        catch (reason) { setError(reason); }
      }
      if (canAssignMachinery) {
        const [machineryData, operatorData] = await Promise.all([
          apiRequest<unknown>("machinery/machinery"),
          apiRequest<unknown>("operators/operators"),
        ]);
        setMachinery(getRows(machineryData));
        setOperators(getRows(operatorData));
      }
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [id, canReadHistory, canAssignMachinery, canReadPaymentDocumentTypes]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(action: string, body: Row = {}) {
    setBusy(true); setError(null);
    try {
      await apiRequest(`service-requests/service-requests/${id}/${action}`, { method: "POST", body });
      onToast(`Service request ${action} action completed.`); await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest(`service-requests/service-requests/${id}`, { method: "PATCH", body: form }); onToast("Service request updated."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  async function initializePayment() {
    setBusy(true); setError(null);
    try {
      const payment = await apiRequest<{ authorization_url?: string }>(
        `service-requests/service-requests/${id}/payments/initialize`,
        { method: "POST", body: { idempotency_key: crypto.randomUUID() } },
      );
      if (!payment.authorization_url) throw new Error("The payment provider did not return a checkout URL.");
      window.location.assign(payment.authorization_url);
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function submitManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      let documentId = evidenceDocumentId.trim();
      if (evidenceFile) {
        const receiptType = documentTypes.find((type) => String(type.name ?? "").trim().toLowerCase() === "payment receipt");
        const documentType = String(receiptType?.id ?? "");
        if (!documentType) throw new Error("Payment receipt document type is not configured. Ask an administrator to seed the document types.");
        if (evidenceFile.size > 25 * 1024 * 1024) throw new Error("The receipt must be 25 MiB or smaller.");
        const mimeType = evidenceFile.type;
        if (!["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) {
          throw new Error("Choose a PDF, JPEG, or PNG receipt.");
        }
        const bytes = await evidenceFile.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const start = await apiRequest<{ document?: { id?: string }; id?: string; upload_url?: string }>("documents/documents", {
          method: "POST",
          body: {
            document_type: documentType,
            owner_type: "user",
            owner_id: session.user.id,
            file_name: evidenceFile.name,
            mime_type: mimeType,
            file_size: evidenceFile.size,
            checksum,
            sensitivity: "STANDARD",
          },
        });
        documentId = String(start.document?.id ?? start.id ?? "");
        if (!documentId || !start.upload_url) throw new Error("The API did not return an upload reference.");
        const uploaded = await fetch(start.upload_url, {
          method: "PUT",
          headers: { "Content-Type": mimeType, "x-amz-meta-sha256": checksum },
          body: bytes,
        });
        if (!uploaded.ok) throw new Error(`Storage upload failed (${uploaded.status}). The receipt was not confirmed.`);
        await apiRequest(`documents/documents/${documentId}/complete`, { method: "POST", body: {} });
        setEvidenceDocumentId(documentId);
        setEvidenceFile(null);
        const fileInput = formElement.querySelector<HTMLInputElement>('input[type="file"]');
        if (fileInput) fileInput.value = "";
      }
      if (!documentId) throw new Error("Upload a receipt or enter an evidence document ID.");
      const body = {
        amount: String(form.get("amount") ?? ""),
        reference: String(form.get("reference") ?? ""),
        evidence_document: documentId,
      };
      await apiRequest(`service-requests/service-requests/${id}/payments/manual`, { method: "POST", body });
      onToast("Manual payment evidence submitted for verification."); await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  if (!request) return <Denied permission="service_request.read" title="Service request" />;
  const status = String(request.status);
  return <>
    <Link href="/service-requests" className="back-link"><ArrowLeft size={14} /> Back to service requests</Link>
    <PageTitle eyebrow="Services / Request details" title={String(request.request_reference ?? "Service request")} description={`${String(request.service_name ?? "Farm service")} · ${titleCase(status)}`} actions={<span className={`status-pill ${status === "COMPLETED" ? "status-good" : "status-wait"}`}>{titleCase(status)}</span>} />
    <Notice error={error} success="" />
    {can("service_request.update") && ["DRAFT", "REQUESTED"].includes(status) && <SectionCard title="Update request details"><form onSubmit={update} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><TextField name="requested_date" label="Requested date" type="date" /><TextField name="requested_acreage" label="Requested acreage" type="number" /><TextField name="crop" label="Crop ID (optional)" hint="Leave blank to keep unchanged." /><TextField name="season" label="Season ID (optional)" hint="Leave blank to keep unchanged." /><TextField name="location" label="Location or access notes" /><TextField name="notes" label="Notes" /><div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="secondary-button">Save request changes</button></div></form></SectionCard>}
    <SectionCard title="Request details" actions={<button className="icon-button" onClick={() => void load()} aria-label="Refresh request"><RefreshCw size={14} /></button>}>
      <dl className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">{[
        ["Farmer / customer", request.farmer_name], ["Farm", request.farm_name], ["Service", request.service_name], ["Crop", request.crop_name], ["Season", request.season_name],
        ["Requested acreage", request.requested_acreage], ["Estimated cost", cash(request.estimated_cost)], ["Requested date", request.requested_date], ["Scheduled date", request.scheduled_date],
        ["Customer phone", request.customer_phone], ["Location", request.location], ["Notes", request.notes],
      ].map(([key, value]) => <div key={String(key)}><dt className="detail-label">{String(key)}</dt><dd className="detail-value">{label(value)}</dd></div>)}</dl>
    </SectionCard>
    {request.completion && typeof request.completion === "object" && <SectionCard title="Completion record">
      <dl className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">{[
        ["Actual acreage", (request.completion as Row).actual_acreage],
        ["Actual cost", cash((request.completion as Row).actual_cost)],
        ["Completed at", (request.completion as Row).completed_at],
        ["Evidence", (request.completion as Row).evidence_document_name],
        ["Completion notes", (request.completion as Row).completion_notes],
      ].map(([key, value]) => <div key={String(key)}><dt className="detail-label">{String(key)}</dt><dd className="detail-value">{label(value)}</dd></div>)}</dl>
    </SectionCard>}
    <SectionCard title="Available actions">
      <div className="flex flex-wrap gap-2 p-5">
        {status === "DRAFT" && can("service_request.submit") && <button disabled={busy} onClick={() => void act("submit")} className="primary-button"><Check size={14} /> Submit</button>}
        {status === "REQUESTED" && can("service_request.review") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const reason = new FormData(event.currentTarget).get("reason"); void act("review", { reason }); }}><label className="field-label">Review note<input className="field-control" name="reason" minLength={3} required /></label><button disabled={busy} className="secondary-button">Start review</button></form>}
        {status === "REVIEWING" && can("service_request.approve") && <button disabled={busy} onClick={() => void act("approve")} className="primary-button"><Check size={14} /> Approve</button>}
        {status === "APPROVED" && can("service_request.schedule") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act("schedule", { scheduled_date: data.get("scheduled_date"), notes: data.get("notes") }); }}><label className="field-label">Schedule date<input className="field-control" type="date" name="scheduled_date" required /></label><label className="field-label">Schedule note<input className="field-control" name="notes" /></label><button disabled={busy} className="secondary-button">Schedule</button></form>}
        {status === "SCHEDULED" && can("service_request.assign") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act("assign", { machinery: data.get("machinery"), ...(data.get("operator") ? { operator: data.get("operator") } : {}) }); }}><label className="field-label">Machinery<select className="field-control" name="machinery" required defaultValue=""><option value="">Select machinery…</option>{machinery.map((asset) => <option key={String(asset.id)} value={String(asset.id)}>{`${asset.asset_code ?? "Asset"} · ${asset.name ?? "Machinery"}`}</option>)}</select></label><label className="field-label">Operator (optional)<select className="field-control" name="operator" defaultValue=""><option value="">Select operator…</option>{operators.map((operator) => <option key={String(operator.id)} value={String(operator.id)}>{`${operator.name ?? "Operator"}${operator.phone ? ` · ${operator.phone}` : ""}`}</option>)}</select></label><button disabled={busy} className="secondary-button">Assign</button></form>}
        {status === "IN_PROGRESS" && can("service_request.complete") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void act("complete", Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== ""))); }}><label className="field-label">Actual acreage<input className="field-control" name="actual_acreage" type="number" min="0" step="any" /></label><label className="field-label">Actual cost<input className="field-control" name="actual_cost" type="number" min="0" step="any" /></label><label className="field-label">Completion notes<input className="field-control" name="completion_notes" /></label><label className="field-label">Evidence document ID<input className="field-control" name="evidence_document" /><span className="field-hint">Upload evidence in <Link className="underline" href="/documents">Documents</Link> first.</span></label><button disabled={busy} className="primary-button">Mark completed</button></form>}
        {["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED"].includes(status) && can("service_request.reject") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const reason = new FormData(event.currentTarget).get("reason"); void act("reject", { reason }); }}><label className="field-label">Rejection reason<input className="field-control" name="reason" minLength={3} required /></label><button disabled={busy} className="danger-button">Reject</button></form>}
        {["DRAFT", "REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED"].includes(status) && can("service_request.cancel") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const reason = new FormData(event.currentTarget).get("reason"); void act("cancel", { reason }); }}><label className="field-label">Cancellation reason<input className="field-control" name="reason" minLength={3} required /></label><button disabled={busy} className="danger-button">Cancel request</button></form>}
        {status === "COMPLETED" && can("service_request.close") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const reason = new FormData(event.currentTarget).get("reason"); void act("close", { reason }); }}><label className="field-label">Close-out note<input className="field-control" name="reason" minLength={3} required /></label><button disabled={busy} className="secondary-button">Close request</button></form>}
        {busy && <span className="flex items-center gap-2 text-xs text-[var(--muted)]"><LoaderCircle size={14} className="animate-spin" />Saving…</span>}
        {!busy && ["CLOSED", "CANCELLED", "REJECTED"].includes(status) && <p className="text-xs text-[var(--muted)]">This service request is no longer active.</p>}
      </div>
    </SectionCard>
    {["PENDING", "PAID"].includes(String(request.payment_status)) && <SectionCard title="Service payment"><p className="p-5 text-sm text-[var(--muted)]">Payment status: {titleCase(request.payment_status)}. {request.payment_status === "PENDING" ? "The payment is awaiting confirmation or manual verification." : "This request has been paid."}</p></SectionCard>}
    {["", "UNPAID", "FAILED"].includes(String(request.payment_status ?? "UNPAID")) && (can("service_payment.initialize") || can("service_payment.manual_submit")) && <SectionCard title="Service payment" description={`Payment status: ${titleCase(String(request.payment_status ?? "UNPAID"))}.`}>
      <div className="flex flex-wrap items-end gap-3 p-5">
        {can("service_payment.initialize") && <button disabled={busy} onClick={() => void initializePayment()} className="primary-button">Pay online</button>}
        {can("service_payment.manual_submit") && <form onSubmit={submitManualPayment} className="flex flex-wrap items-end gap-2">
          <label className="field-label">Amount<input className="field-control" name="amount" type="number" min="0.01" step="0.01" required defaultValue={String(request.estimated_cost ?? "")} /></label>
          <label className="field-label">Receipt reference<input className="field-control" name="reference" required /></label>
          <label className="field-label">Evidence document ID<input className="field-control" name="evidence_document" value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)} /><span className="field-hint">Paste an existing ID, or upload your receipt here.</span></label>
          {can("document.create") && can("document_type.read") && <>
            <label className="field-label">Receipt file<input className="field-control !h-auto !py-2" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} /><span className="field-hint">{evidenceFile?.name ?? "PDF, JPEG, or PNG · up to 25 MiB"}</span></label>
          </>}
          <button disabled={busy} className="secondary-button">Submit manual payment</button>
        </form>}
      </div>
    </SectionCard>}
    {can("service_request.history") && <SectionCard title="Status history"><DataTable columns={[{ key: "old_status", label: "Previous status" }, { key: "new_status", label: "New status", status: true }, { key: "changed_by_name", label: "Changed by" }, { key: "reason", label: "Reason" }, { key: "created_at", label: "Date" }]} rows={history} empty="No status history is available." /></SectionCard>}
  </>;
}

function MachineryPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [assets, setAssets] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [operators, setOperators] = useState<Row[]>([]);
  const [maintenance, setMaintenance] = useState<Row[]>([]);
  const [utilization, setUtilization] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [editingAsset, setEditingAsset] = useState<Row | null>(null);
  const [editingOperator, setEditingOperator] = useState<Row | null>(null);
  const canRead = permitted(session, "machinery.read");
  const canCreate = permitted(session, "machinery.create");
  const canUpdate = permitted(session, "machinery.update");
  const canMaintain = permitted(session, "machinery.maintenance");
  const canReadUtilization = permitted(session, "machinery.utilization.read");
  const canReadAssignmentHistory = canRead && hasOperationsScope(session);
  const fieldOfficer = isFieldOfficer(session);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [assetData, operatorData, maintenanceData, utilizationData] = await Promise.all([
        canRead ? apiRequest<unknown>("machinery/machinery") : Promise.resolve([]),
        canRead && !fieldOfficer ? apiRequest<unknown>("operators/operators") : Promise.resolve([]),
        canRead && !fieldOfficer ? apiRequest<unknown>("machinery/maintenance") : Promise.resolve([]),
        canReadUtilization ? apiRequest<unknown>("machinery/utilization") : Promise.resolve({ results: [] }),
      ]);
      setAssets(getRows(assetData));
      setOperators(getRows(operatorData));
      setMaintenance(getRows(maintenanceData));
      setUtilization(getRows(utilizationData));
    }
    catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [canRead, canReadUtilization, fieldOfficer]);
  useEffect(() => {
    if (!canRead && !canCreate && !canMaintain && !canReadUtilization) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [canRead, canCreate, canMaintain, canReadUtilization, load]);
  useEffect(() => { if (!selected || !canReadAssignmentHistory) return; apiRequest<unknown>(`machinery/machinery/${selected}/assignments`).then((data) => setAssignments(getRows(data))).catch((reason: unknown) => setError(reason)); }, [selected, canReadAssignmentHistory]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess("");
    const formElement = event.currentTarget;
    const body = Object.fromEntries(new FormData(formElement).entries());
    try { await apiRequest("machinery/machinery", { method: "POST", body }); formElement.reset(); setSuccess("Machinery asset created."); onToast("Machinery asset created."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function updateAvailability(id: string, status: string) {
    setBusy(true); setError(null);
    try { await apiRequest(`machinery/machinery/${id}/availability`, { method: "POST", body: { status } }); onToast("Machinery availability updated."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function updateAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAsset) return;
    setBusy(true); setError(null);
    const body = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest(`machinery/machinery/${String(editingAsset.id)}`, { method: "PATCH", body }); setEditingAsset(null); onToast("Machinery details updated."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function createOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest("operators/operators", { method: "POST", body: form }); onToast("Operator registered."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function updateOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOperator) return;
    setBusy(true); setError(null);
    const form = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try {
      await apiRequest(`operators/operators/${String(editingOperator.id)}`, { method: "PATCH", body: form });
      setEditingOperator(null); onToast("Operator record updated."); await load();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function createMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest("machinery/maintenance", { method: "POST", body: form }); onToast("Maintenance scheduled."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function maintenanceAction(id: string, action: string, body: Row = {}) {
    setBusy(true); setError(null);
    try { await apiRequest(`machinery/maintenance/${id}/${action}`, { method: "POST", body }); onToast(`Maintenance ${action} action completed.`); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  if (!canRead && !canCreate && !canMaintain && !canReadUtilization) return <Denied permission="machinery.read, machinery.create, or fleet permissions" title="Machinery" />;
  return <>
    <PageTitle eyebrow="Services / Mechanization" title="Machinery" description="Review the machinery fleet, update asset availability, and inspect service assignments." actions={canRead ? <button className="icon-button" onClick={() => void load()} aria-label="Refresh machinery"><RefreshCw size={14} /></button> : undefined} />
    <Notice error={error} success={success} />
    {canRead && <SectionCard title="Fleet and availability">
      {loading ? <Loading /> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Asset</th><th>Machine</th><th>Type</th><th>Location</th><th>Condition</th><th>Status</th>{canReadAssignmentHistory && <th>Assignments</th>}{canUpdate && <th>Manage</th>}</tr></thead><tbody>{assets.map((asset) => <tr key={String(asset.id)}><td className="mono">{String(asset.asset_code)}</td><td>{label(asset.name)}</td><td>{titleCase(asset.type)}</td><td>{label(asset.location)}</td><td>{titleCase(asset.condition)}</td><td><span className="status-pill status-neutral">{titleCase(asset.status)}</span></td>{canReadAssignmentHistory && <td><button className="secondary-button min-h-8" onClick={() => setSelected(String(asset.id))}>View history</button></td>}{canUpdate && <td><div className="flex items-center gap-1"><button className="secondary-button min-h-8" onClick={() => setEditingAsset(asset)}>Edit details</button><select className="field-control h-8 min-w-32" disabled={busy} value={String(asset.status)} aria-label={`Set availability for ${String(asset.asset_code)}`} onChange={(event) => void updateAvailability(String(asset.id), event.target.value)}>{["AVAILABLE", "IN_USE", "MAINTENANCE", "DECOMMISSIONED"].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></div></td>}</tr>)}</tbody></table>{!assets.length && <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No machinery assets found.</p>}</div>}
    </SectionCard>}
    {canUpdate && editingAsset && <SectionCard title={`Edit ${String(editingAsset.asset_code)}`} actions={<button className="secondary-button" onClick={() => setEditingAsset(null)}>Cancel</button>}><form onSubmit={updateAsset} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><TextField name="name" label="Name" defaultValue={String(editingAsset.name ?? "")} /><OperationalOptionSelect kind="MACHINERY_TYPE" name="type" label="Machinery type" required defaultValue={String(editingAsset.type ?? "")} isSuperAdmin={isSuperAdmin(session)} /><TextField name="serial_number" label="Serial number" defaultValue={String(editingAsset.serial_number ?? "")} /><TextField name="location" label="Location" defaultValue={String(editingAsset.location ?? "")} /><TextField name="condition" label="Condition" defaultValue={String(editingAsset.condition ?? "")} /><button disabled={busy} className="primary-button">Save machinery</button></form></SectionCard>}
    {selected && <SectionCard title="Assignment history" actions={<button className="secondary-button" onClick={() => setSelected("")}>Close</button>}><DataTable columns={[{ key: "service_request", label: "Service request" }, { key: "operator_name", label: "Operator" }, { key: "assigned_by_name", label: "Assigned by" }, { key: "assigned_at", label: "Assigned at" }, { key: "returned_at", label: "Returned at" }, { key: "status", label: "Status", status: true }]} rows={assignments} empty="No assignments recorded for this asset." /></SectionCard>}
    {canCreate && <SectionCard title="Register machinery"><form onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><TextField name="asset_code" label="Asset code" required /><TextField name="name" label="Name" required /><OperationalOptionSelect kind="MACHINERY_TYPE" name="type" label="Machinery type" required isSuperAdmin={isSuperAdmin(session)} /><TextField name="serial_number" label="Serial number" /><TextField name="location" label="Location" /><TextField name="condition" label="Condition" /><label className="field-label">Initial status<select className="field-control" name="status" defaultValue="AVAILABLE">{["AVAILABLE", "IN_USE", "MAINTENANCE", "DECOMMISSIONED"].map((status) => <option key={status}>{status}</option>)}</select></label><div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="primary-button"><Plus size={14} /> Add machinery</button></div></form></SectionCard>}
    {!fieldOfficer && (canRead || canCreate) && <SectionCard title="Operator records">
      {canRead && (operators.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Operator</th><th>Phone</th><th>License</th><th>Status</th>{canUpdate && <th>Manage</th>}</tr></thead><tbody>{operators.map((operator) => <tr key={String(operator.id)}><td>{label(operator.name)}</td><td>{label(operator.phone)}</td><td>{label(operator.license_reference)}</td><td>{titleCase(operator.status)}</td>{canUpdate && <td><button className="secondary-button min-h-8" onClick={() => setEditingOperator(operator)}>Edit</button></td>}</tr>)}</tbody></table></div> : <p className="px-5 py-5 text-sm text-[var(--muted)]">No operators are registered.</p>)}
      {canRead && editingOperator && <form onSubmit={updateOperator} className="grid gap-3 border-t border-[var(--line)] p-5 sm:grid-cols-2 lg:grid-cols-4"><TextField name="name" label="Operator name" required defaultValue={String(editingOperator.name ?? "")} /><TextField name="phone" label="Phone" defaultValue={String(editingOperator.phone ?? "")} /><TextField name="license_reference" label="License reference" defaultValue={String(editingOperator.license_reference ?? "")} /><label className="field-label">Status<select className="field-control" name="status" defaultValue={String(editingOperator.status ?? "ACTIVE")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><div className="flex gap-2 sm:col-span-2 lg:col-span-4"><button disabled={busy} className="primary-button">Save operator</button><button type="button" className="secondary-button" onClick={() => setEditingOperator(null)}>Cancel</button></div></form>}
      {canCreate && <form onSubmit={createOperator} className="grid gap-3 border-t border-[var(--line)] p-5 sm:grid-cols-2 lg:grid-cols-4"><TextField name="name" label="Operator name" required /><TextField name="phone" label="Phone" /><TextField name="license_reference" label="License reference" /><button disabled={busy} className="secondary-button self-end">Add operator</button></form>}
    </SectionCard>}
    {canMaintain && <SectionCard title="Schedule fleet maintenance" description="Only available assets can be scheduled for maintenance.">
      <form onSubmit={createMaintenance} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="field-label">Asset<select className="field-control" name="machinery" required defaultValue=""><option value="">Select asset…</option>{assets.filter((asset) => asset.status === "AVAILABLE").map((asset) => <option key={String(asset.id)} value={String(asset.id)}>{`${asset.asset_code} · ${asset.name}`}</option>)}</select></label>
        <OperationalOptionSelect kind="MAINTENANCE_TYPE" name="maintenance_type" label="Maintenance type" required isSuperAdmin={isSuperAdmin(session)} />
        <TextField name="scheduled_for" label="Scheduled for" type="date" required />
        <OperationalOptionSelect kind="VENDOR" name="vendor" label="Vendor" isSuperAdmin={isSuperAdmin(session)} />
        <TextField name="cost" label="Estimated cost" type="number" />
        <TextField name="description" label="Description" required />
        <div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="primary-button">Schedule maintenance</button></div>
      </form>
      <DataTable columns={[{ key: "machinery_code", label: "Asset" }, { key: "maintenance_type", label: "Type" }, { key: "scheduled_for", label: "Scheduled" }, { key: "status", label: "Status", status: true }, { key: "cost", label: "Cost", money: true }]} rows={maintenance} empty="No maintenance records are available." />
      <div className="flex flex-col gap-3 border-t border-[var(--line)] p-4">{maintenance.filter((record) => ["SCHEDULED", "IN_PROGRESS"].includes(String(record.status))).map((record) => <div key={String(record.id)} className="flex flex-wrap items-end gap-2 text-xs"><span className="mr-2">{String(record.machinery_code)} · {titleCase(String(record.status))}</span>{record.status === "SCHEDULED" && <><button className="secondary-button min-h-8" disabled={busy} onClick={() => void maintenanceAction(String(record.id), "start")}>Start maintenance</button><button className="danger-button min-h-8" disabled={busy} onClick={() => { const reason = window.prompt("Why are you cancelling this maintenance?"); if (reason?.trim()) void maintenanceAction(String(record.id), "cancel", { reason: reason.trim() }); }}>Cancel</button></>}{record.status === "IN_PROGRESS" && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== "")); void maintenanceAction(String(record.id), "complete", body); }}><label className="field-label">Final cost<input className="field-control" name="cost" type="number" min="0" step="0.01" /></label><label className="field-label">Completion notes<input className="field-control" name="notes" /></label><button className="primary-button min-h-8" disabled={busy}>Complete maintenance</button></form>}</div>)}</div>
    </SectionCard>}
    {canReadUtilization && <SectionCard title="Fleet utilization" description="Assignment duration and completed acreage; live GPS tracking is not enabled."><DataTable columns={[{ key: "asset_code", label: "Asset" }, { key: "status", label: "Status", status: true }, { key: "assignment_count", label: "Assignments" }, { key: "active_assignments", label: "Active" }, { key: "utilization_hours", label: "Utilization hours" }, { key: "completed_acreage", label: "Completed acreage" }]} rows={utilization} empty="No utilization data is available." /></SectionCard>}
  </>;
}

function ProducePage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [offers, setOffers] = useState<Row[]>([]);
  const [farmers, setFarmers] = useState<Row[]>([]);
  const [farms, setFarms] = useState<Row[]>([]);
  const [crops, setCrops] = useState<Row[]>([]);
  const [seasons, setSeasons] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [editingOffer, setEditingOffer] = useState<Row | null>(null);
  const [workflowOffer, setWorkflowOffer] = useState<Row | null>(null);
  const [workflowAction, setWorkflowAction] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const canRead = permitted(session, "produce.read");
  const canCreate = permitted(session, "produce.create");
  const canUpdate = permitted(session, "produce.update");
  const can = (permission: string) => permitted(session, permission);
  const fieldOfficer = isFieldOfficer(session);
  const [selectedFarmerId, setSelectedFarmerId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const needsFarmerSelection = canCreate && session.user.user_type !== "FARMER";
      const [offersData, farmersData, farmsData, cropsData, seasonsData] = await Promise.all([
        canRead ? apiRequest<unknown>("produce/listings") : Promise.resolve([]),
        needsFarmerSelection ? apiRequest<unknown>("farmers/farmers?page=1&page_size=100") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("farms/farms") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("crops/crops") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("seasons") : Promise.resolve([]),
      ]);
      setOffers(getRows(offersData)); setFarmers(getRows(farmersData)); setFarms(getRows(farmsData)); setCrops(getRows(cropsData)); setSeasons(getRows(seasonsData));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [canRead, canCreate, session.user.user_type]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess("");
    const formElement = event.currentTarget;
    const body = Object.fromEntries([...new FormData(formElement).entries()].filter(([, value]) => String(value).trim() !== ""));
    if (session.user.user_type === "FARMER") delete body.farmer;
    try { const result = await apiRequest<Row>("produce/listings", { method: "POST", body });     setSuccess(`Produce listing ${String(result.offer_reference ?? "")} created.`); formElement.reset(); setSelectedFarmerId(""); onToast("Produce listing created."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function action(id: string, actionName: string, body?: Row) {
    setBusy(true); setError(null);
    try { await apiRequest(`produce/listings/${id}/${actionName}`, { method: "POST", body }); setWorkflowOffer(null); onToast(`Produce listing ${actionName} completed.`); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function submitWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workflowOffer) return;
    const body = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    await action(String(workflowOffer.id), workflowAction, body);
  }
  async function updateOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOffer) return;
    setBusy(true); setError(null);
    const body = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest(`produce/listings/${String(editingOffer.id)}`, { method: "PATCH", body }); setEditingOffer(null); onToast("Produce listing updated."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  if (!canRead && !canCreate) return <Denied permission="produce.read or produce.create" title="Produce listings" />;
  const columns = [{ key: "offer_reference", label: "Listing" }, { key: "farmer_name", label: "Farmer" }, { key: "farm_name", label: "Farm" }, { key: "crop_name", label: "Crop" }, { key: "season_name", label: "Season" }, { key: "quantity", label: "Quantity" }, { key: "unit", label: "Unit" }, { key: "asking_price", label: "Asking price", money: true }, { key: "harvest_status", label: "Harvest" }, { key: "status", label: "Workflow status", status: true }];
  const visibleOffers = offers.filter((offer) => statusFilter === "ALL" || offer.status === statusFilter);
  return <>
    <PageTitle eyebrow="Produce / Selling" title="Produce listings" description="Submit offers for review, record quality decisions and follow accepted produce into procurement." actions={<button className="icon-button" onClick={() => void load()} aria-label="Refresh listings"><RefreshCw size={14} /></button>} />
    <Notice error={error} success={success} />
    {canRead && <SectionCard title="Current listings" actions={<label className="field-label">Status<select className="field-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{["DRAFT", "SUBMITTED", "REVIEWING", "QUALITY_ASSESSED", "NEGOTIATION", "ACCEPTED", "PUBLISHED", "COLLECTED", "WEIGHED", "PURCHASED", "REJECTED", "CLOSED"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>}>{loading ? <Loading /> : <div className="overflow-x-auto"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Actions / history</th></tr></thead><tbody>{visibleOffers.map((offer) => { const history = Array.isArray(offer.history) ? offer.history as Row[] : []; return <tr key={String(offer.id)}>{columns.map((column) => <td key={column.key}>{column.status ? <span className={`status-pill ${["PUBLISHED", "ACCEPTED", "PURCHASED"].includes(String(offer.status)) ? "status-good" : "status-wait"}`}>{titleCase(offer.status)}</span> : column.money ? cash(offer[column.key]) : label(offer[column.key])}</td>)}<td><div className="flex flex-wrap gap-1">{canUpdate && ["DRAFT", "SUBMITTED"].includes(String(offer.status)) && <button disabled={busy} className="secondary-button min-h-8" onClick={() => setEditingOffer(offer)}>Edit</button>}{offer.status === "DRAFT" && can("produce.submit") && <button disabled={busy} className="secondary-button min-h-8" onClick={() => void action(String(offer.id), "submit")}>Submit</button>}{offer.status === "SUBMITTED" && can("produce.review") && <button disabled={busy} className="secondary-button min-h-8" onClick={() => void action(String(offer.id), "review")}>Start review</button>}{offer.status === "REVIEWING" && can("produce.assess") && <button disabled={busy} className="secondary-button min-h-8" onClick={() => { setWorkflowOffer(offer); setWorkflowAction("assess"); }}>Assess quality</button>}{["QUALITY_ASSESSED", "NEGOTIATION"].includes(String(offer.status)) && (can("produce.decide") || canUpdate) && <button disabled={busy} className="secondary-button min-h-8" onClick={() => { setWorkflowOffer(offer); setWorkflowAction("decide"); }}>Decide / counter</button>}{offer.status === "ACCEPTED" && can("produce.publish") && <button disabled={busy} className="secondary-button min-h-8" onClick={() => void action(String(offer.id), "publish")}>Publish</button>}{(can("produce.close") || can("produce.archive")) && !["CLOSED", "PURCHASED"].includes(String(offer.status)) && <button disabled={busy} className="secondary-button min-h-8" onClick={() => void action(String(offer.id), "close")}>Close</button>}{history.length > 0 && <details className="min-w-40"><summary className="cursor-pointer text-xs underline">Status history ({history.length})</summary><ol className="mt-2 space-y-2">{history.map((event, index) => <li key={String(event.id ?? index)} className="text-[10px]"><strong>{titleCase(event.action)}</strong> · {label(event.changed_by_name)} · {label(event.created_at)}{event.notes ? <span className="block text-[var(--muted)]">{label(event.notes)}</span> : null}</li>)}</ol></details>}</div></td></tr>; })}</tbody></table>{!visibleOffers.length && <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No produce listings match this status.</p>}</div>}</SectionCard>}
    {workflowOffer && <SectionCard title={`${workflowAction === "assess" ? "Quality assessment" : "Offer decision"} · ${String(workflowOffer.offer_reference)}`} actions={<button className="secondary-button" onClick={() => setWorkflowOffer(null)}>Cancel</button>}><form onSubmit={submitWorkflow} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">{workflowAction === "assess" ? <><OperationalOptionSelect kind="PRODUCE_QUALITY_GRADE" name="grade" label="Assessed grade" required isSuperAdmin={isSuperAdmin(session)} /><TextField name="moisture" label="Moisture (%)" type="number" /><TextField name="notes" label="Assessment notes" /></> : <><label className="field-label">Decision<select className="field-control" name="decision" required><option value="ACCEPT">Accept</option><option value="NEGOTIATE">Negotiate / counter</option><option value="REJECT">Reject</option></select></label><TextField name="proposed_quantity" label="Proposed quantity (for negotiation)" type="number" /><TextField name="proposed_price" label="Proposed unit price (for negotiation)" type="number" /><TextField name="notes" label="Decision notes" /></>}<button disabled={busy} className="primary-button">{workflowAction === "assess" ? "Save assessment" : "Record decision"}</button></form></SectionCard>}
    {editingOffer && <SectionCard title={`Edit ${String(editingOffer.offer_reference)}`} actions={<button className="secondary-button" onClick={() => setEditingOffer(null)}>Cancel</button>}><form onSubmit={updateOffer} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><TextField name="quantity" label="Quantity" type="number" defaultValue={String(editingOffer.quantity ?? "")} /><TextField name="unit" label="Unit" defaultValue={String(editingOffer.unit ?? "")} /><TextField name="expected_harvest_at" label="Expected harvest date" type="date" defaultValue={String(editingOffer.expected_harvest_at ?? "")} /><label className="field-label">Harvest status<select className="field-control" name="harvest_status" defaultValue={String(editingOffer.harvest_status ?? "EXPECTED")}><option value="EXPECTED">Expected</option><option value="READY">Ready for harvest</option><option value="HARVESTED">Harvested</option></select></label><OperationalOptionSelect kind="PRODUCE_QUALITY_GRADE" name="quality_grade" label="Quality grade" defaultValue={String(editingOffer.quality_grade ?? "")} isSuperAdmin={isSuperAdmin(session)} /><TextField name="location" label="Collection location" defaultValue={String(editingOffer.location ?? "")} /><TextField name="asking_price" label="Asking price (NGN)" type="number" defaultValue={String(editingOffer.asking_price ?? "")} /><button disabled={busy} className="primary-button">Save listing</button></form></SectionCard>}
    {canCreate && <SectionCard title="Create produce listing" description="Create a draft offer, then submit it for review and quality assessment.">
      <form onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {session.user.user_type !== "FARMER" && <label className="field-label">Farmer{fieldOfficer ? "" : " (optional)"}<select className="field-control" name="farmer" required={fieldOfficer} value={selectedFarmerId} onChange={(event) => setSelectedFarmerId(event.target.value)}><option value="">Select a farmer…</option>{farmers.map((farmer) => {
          const farmerName = [farmer.first_name, farmer.last_name].filter(Boolean).map(String).join(" ") || String(farmer.email ?? "Farmer");
          const farmerNumber = farmer.farmer_number ? ` · ${String(farmer.farmer_number)}` : "";
          return <option key={String(farmer.id)} value={String(farmer.id)}>{farmerName}{farmerNumber}</option>;
        })}</select><span className="field-hint">Choose a farmer by name for this assisted listing.</span></label>}
        <SelectField name="farm" label="Farm" rows={farms.filter((farm) => !fieldOfficer || !selectedFarmerId || String(farm.farmer_id) === selectedFarmerId)} required /><SelectField name="crop" label="Crop" rows={crops} required /><SelectField name="season" label="Season (optional)" rows={seasons} />
        <TextField name="quantity" label="Quantity" type="number" required /><TextField name="unit" label="Unit" hint="For example KG or TONS." /><TextField name="asking_price" label="Asking price (NGN)" type="number" required />
        <TextField name="expected_harvest_at" label="Expected harvest date" type="date" /><label className="field-label">Harvest status<select className="field-control" name="harvest_status" defaultValue="EXPECTED"><option value="EXPECTED">Expected</option><option value="READY">Ready for harvest</option><option value="HARVESTED">Harvested</option></select></label><OperationalOptionSelect kind="PRODUCE_QUALITY_GRADE" name="quality_grade" label="Quality grade" isSuperAdmin={isSuperAdmin(session)} /><TextField name="location" label="Collection location" />
        <div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="primary-button"><Plus size={14} /> Create listing</button></div>
      </form>
    </SectionCard>}
  </>;
}

function ProcurementPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [orders, setOrders] = useState<Row[]>([]);
  const [offers, setOffers] = useState<Row[]>([]);
  const [buyers, setBuyers] = useState<Row[]>([]);
  const [farmers, setFarmers] = useState<Row[]>([]);
  const [crops, setCrops] = useState<Row[]>([]);
  const [seasons, setSeasons] = useState<Row[]>([]);
  const [orderLines, setOrderLines] = useState([0]);
  const [nextOrderLine, setNextOrderLine] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [cropFilter, setCropFilter] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [farmerFilter, setFarmerFilter] = useState("");
  const canRead = permitted(session, "procurement.read");
  const canCreate = permitted(session, "procurement.create");
  const canReadProduce = permitted(session, "produce.read");
  const canReadFarmers = permitted(session, "farmer.read");
  const canReadCrops = permitted(session, "crop.read");
  const canReadSeasons = permitted(session, "season.read");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const filters = new URLSearchParams();
      if (statusFilter) filters.set("status", statusFilter);
      if (searchFilter.trim()) filters.set("search", searchFilter.trim());
      if (cropFilter) filters.set("crop_id", cropFilter);
      if (seasonFilter) filters.set("season_id", seasonFilter);
      if (farmerFilter) filters.set("farmer_id", farmerFilter);
      const query = filters.size ? `?${filters.toString()}` : "";
      const [ordersData, offersData, buyersData, farmerData, cropData, seasonData] = await Promise.all([
        canRead ? apiRequest<unknown>(`procurement/records${query}`) : Promise.resolve([]),
        canCreate && canReadProduce ? apiRequest<unknown>("produce/listings") : Promise.resolve([]),
        canRead ? apiRequest<unknown>("procurement/buyers") : Promise.resolve([]),
        canRead && canReadFarmers ? apiRequest<unknown>("farmers/farmers?page=1&page_size=100") : Promise.resolve([]),
        canRead && canReadCrops ? apiRequest<unknown>("crops/crops") : Promise.resolve([]),
        canRead && canReadSeasons ? apiRequest<unknown>("seasons") : Promise.resolve([]),
      ]);
      setOrders(getRows(ordersData)); setOffers(getRows(offersData).filter((offer) => offer.status === "PUBLISHED")); setBuyers(getRows(buyersData)); setFarmers(getRows(farmerData)); setCrops(getRows(cropData)); setSeasons(getRows(seasonData));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [canRead, canCreate, canReadProduce, canReadFarmers, canReadCrops, canReadSeasons, statusFilter, searchFilter, cropFilter, seasonFilter, farmerFilter]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const items: Row[] = [];
    for (const index of orderLines) {
      const produceOffer = form.get(`produce_offer_${index}`);
      const quantity = form.get(`quantity_${index}`);
      const unitPrice = form.get(`unit_price_${index}`);
      if (!produceOffer && !quantity && !unitPrice) continue;
      if (!produceOffer || !quantity || !unitPrice) {
        setError(new Error("For each produce item, choose a listing and enter both quantity and unit price."));
        setBusy(false);
        return;
      }
      items.push({ produce_offer: produceOffer, quantity, unit_price: unitPrice });
    }
    const body = {
      buyer_name: form.get("buyer_name"),
      buyer_type: form.get("buyer_type") || "INTERNAL_PROCESSING",
      items,
    };
    try { const order = await apiRequest<Row>("procurement/records", { method: "POST", body }); setSuccess(`Procurement order ${String(order.order_reference ?? "")} created.`); formElement.reset(); onToast("Procurement order created."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  if (!canRead && !canCreate) return <Denied permission="procurement.read or procurement.create" title="Procurement" />;
  const settlements = orders.flatMap((order) => Array.isArray(order.settlements) ? order.settlements as Row[] : []);
  return <>
    <PageTitle eyebrow="Produce / Procurement" title="Procurement" description="Filter procurement activity, manage fulfillment, and verify farmer settlements." actions={<div className="flex gap-2"><Link href="/procurement/forecast" className="secondary-button">View forecast<ArrowRight size={13} /></Link><button className="icon-button" onClick={() => void load()} aria-label="Refresh procurement"><RefreshCw size={14} /></button></div>} />
    <Notice error={error} success={success} />
    {canRead && <SectionCard title="Procurement orders" actions={<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><label className="field-label">Status<select className="field-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{["DRAFT", "CONFIRMED", "PROCESSING", "COMPLETED"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label><label className="field-label">Search<input className="field-control" value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Order, buyer, or listing" /></label><label className="field-label">Crop<select className="field-control" value={cropFilter} onChange={(event) => setCropFilter(event.target.value)} disabled={!canReadCrops}><option value="">All crops</option>{crops.map((crop) => <option key={String(crop.id)} value={String(crop.id)}>{String(crop.name ?? crop.crop_name ?? "Crop")}</option>)}</select></label><label className="field-label">Season<select className="field-control" value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)} disabled={!canReadSeasons}><option value="">All seasons</option>{seasons.map((season) => <option key={String(season.id)} value={String(season.id)}>{`${String(season.name ?? "Season")}${season.year ? ` · ${String(season.year)}` : ""}`}</option>)}</select></label><label className="field-label">Farmer<select className="field-control" value={farmerFilter} onChange={(event) => setFarmerFilter(event.target.value)} disabled={!canReadFarmers}><option value="">All farmers</option>{farmers.map((farmer) => <option key={String(farmer.id)} value={String(farmer.id)}>{`${farmer.farmer_number ?? farmer.provisional_reference ?? "Farmer"} · ${[farmer.first_name, farmer.last_name].filter(Boolean).map(String).join(" ") || String(farmer.email ?? "")}`}</option>)}</select></label></div>}>{loading ? <Loading /> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Order</th><th>Buyer</th><th>Type</th><th>Items</th><th>Total</th><th>Status</th><th>Settlements</th></tr></thead><tbody>{orders.map((order) => <tr key={String(order.id)}><td><Link className="font-semibold text-[var(--leaf)] hover:underline" href={`/procurement/${String(order.id)}`}>{label(order.order_reference)}</Link></td><td>{label(order.buyer_name)}</td><td>{titleCase(order.buyer_type)}</td><td>{Array.isArray(order.items) ? order.items.length : 0}</td><td>{cash(order.total_amount)}</td><td><span className="status-pill status-wait">{titleCase(order.status)}</span></td><td>{Array.isArray(order.settlements) ? order.settlements.map((item) => `${cash((item as Row).amount)} · ${titleCase((item as Row).payment_status)}`).join(", ") || "—" : "—"}</td></tr>)}</tbody></table>{!orders.length && <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No procurement orders found.</p>}</div>}</SectionCard>}
    {canCreate && <SectionCard title="Create procurement order" description="Choose an accepted and published produce listing to add to a draft order.">
      <form onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><label className="field-label">Buyer name<input className="field-control" name="buyer_name" list="operations-buyers" required /><datalist id="operations-buyers">{buyers.map((buyer, index) => <option key={`${String(buyer.buyer_name)}-${index}`} value={String(buyer.buyer_name)} />)}</datalist></label><TextField name="buyer_type" label="Buyer type" hint="For example INTERNAL_PROCESSING." />
        <div className="sm:col-span-2 lg:col-span-3"><h3 className="mb-3 text-xs font-semibold">Produce items</h3><div className="space-y-3">{orderLines.map((index) => <div key={index} className="grid items-end gap-3 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"><SelectField name={`produce_offer_${index}`} label="Published produce" rows={offers} required /><TextField name={`quantity_${index}`} label="Quantity" type="number" required /><TextField name={`unit_price_${index}`} label="Unit price (NGN)" type="number" required />{orderLines.length > 1 && <button type="button" className="secondary-button" onClick={() => setOrderLines((current) => current.filter((value) => value !== index))}>Remove</button>}</div>)}</div><button type="button" className="secondary-button mt-3" onClick={() => { setOrderLines((current) => [...current, nextOrderLine]); setNextOrderLine((current) => current + 1); }}><Plus size={13} /> Add produce item</button></div>
        <div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="primary-button"><Plus size={14} /> Create draft order</button></div></form>
    </SectionCard>}
    {canRead && <SectionCard title="Produce settlements" description="Completion generates pending farmer settlement records; payment processing is handled separately."><DataTable columns={[{ key: "settlement_reference", label: "Settlement" }, { key: "farmer_name", label: "Farmer" }, { key: "amount", label: "Amount", money: true }, { key: "currency", label: "Currency" }, { key: "payment_status", label: "Payment status", status: true }]} rows={settlements} empty="No settlements have been generated." /></SectionCard>}
  </>;
}

function ProcurementDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const [order, setOrder] = useState<Row | null>(null);
  const [documentTypes, setDocumentTypes] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const canRead = permitted(session, "procurement.read");
  const canUploadSettlementEvidence = permitted(session, "procurement.settlement.submit")
    && permitted(session, "document.create")
    && permitted(session, "document_type.read");
  const load = useCallback(async () => {
    setError(null);
    try {
      const [orderData, typesData] = await Promise.all([
        apiRequest<Row>(`procurement/records/${id}`),
        canUploadSettlementEvidence ? apiRequest<unknown>("document-types") : Promise.resolve([]),
      ]);
      setOrder(orderData);
      setDocumentTypes(getRows(typesData));
    } catch (reason) { setError(reason); }
  }, [id, canUploadSettlementEvidence]);
  useEffect(() => {
    if (!canRead) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [canRead, load]);
  async function action(name: string) {
    setBusy(true); setError(null);
    try { await apiRequest(`procurement/records/${id}/${name}`, { method: "POST" }); onToast(`Procurement order ${name}d.`); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function updateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const body = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest(`procurement/records/${id}`, { method: "PATCH", body }); onToast("Procurement order updated."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function recordCollection(itemId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const body = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest(`procurement/items/${itemId}/collect`, { method: "POST", body }); onToast("Collection recorded."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function recordWeighing(collectionId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const body = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== ""));
    try { await apiRequest(`procurement/collections/${collectionId}/weigh`, { method: "POST", body }); onToast("Produce weighing recorded."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function settlementAction(settlement: Row, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const formData = new FormData(event.currentTarget);
    const submitEvidence = ["PENDING", "REJECTED"].includes(String(settlement.payment_status));
    const path = `procurement/settlements/${String(settlement.id)}/${submitEvidence ? "submit" : "verify"}`;
    try {
      let body: Row;
      if (submitEvidence) {
        const file = formData.get("evidence_file");
        const documentType = String(formData.get("document_type") ?? "");
        const paymentReference = String(formData.get("payment_reference") ?? "").trim();
        if (!(file instanceof File) || !file.size || !documentType) throw new Error("Choose a payout evidence document type and file.");
        if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MiB or smaller.");
        const bytes = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const start = await apiRequest<{ document?: { id?: string }; id?: string; upload_url: string }>("documents/documents", {
          method: "POST",
          body: {
            document_type: documentType, owner_type: "user", owner_id: session.user.id,
            file_name: file.name, mime_type: file.type || "application/octet-stream",
            file_size: file.size, checksum, sensitivity: "STANDARD",
          },
        });
        const documentId = String(start.document?.id ?? start.id ?? "");
        if (!documentId || !start.upload_url) throw new Error("The API did not return an upload reference.");
        const uploaded = await fetch(start.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream", "x-amz-meta-sha256": checksum },
          body: bytes,
        });
        if (!uploaded.ok) throw new Error(`Storage upload failed (${uploaded.status}). Check the document record before retrying.`);
        await apiRequest(`documents/documents/${documentId}/complete`, { method: "POST", body: {} });
        body = { payment_reference: paymentReference, evidence_document: documentId };
      } else {
        body = Object.fromEntries([...formData.entries()].filter(([, value]) => String(value).trim() !== ""));
      }
      await apiRequest(path, { method: "POST", body });
      onToast(submitEvidence ? "Settlement evidence submitted." : "Settlement verification recorded.");
      await load();
    }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  if (!permitted(session, "procurement.read")) return <Denied permission="procurement.read" title="Procurement order" />;
  if (!order) return <><Link href="/procurement" className="back-link"><ArrowLeft size={14} /> Back to procurement</Link><Notice error={error} success="" /></>;
  const items = Array.isArray(order.items) ? order.items as Row[] : [];
  const orderSettlements = Array.isArray(order.settlements) ? order.settlements as Row[] : [];
  return <>
    <Link href="/procurement" className="back-link"><ArrowLeft size={14} /> Back to procurement</Link>
    <PageTitle eyebrow="Procurement / Order details" title={String(order.order_reference)} description={`${String(order.buyer_name)} · ${titleCase(order.status)}`} actions={<span className="status-pill status-wait">{titleCase(order.status)}</span>} />
    <Notice error={error} success="" />
    {order.status === "DRAFT" && permitted(session, "procurement.update") && <SectionCard title="Update draft order"><form onSubmit={updateOrder} className="grid gap-4 p-5 sm:grid-cols-2"><TextField name="buyer_name" label="Buyer name" defaultValue={String(order.buyer_name ?? "")} /><TextField name="buyer_type" label="Buyer type" defaultValue={String(order.buyer_type ?? "")} /><div className="sm:col-span-2"><button disabled={busy} className="secondary-button">Save order details</button></div></form></SectionCard>}
    <SectionCard title="Order summary"><dl className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">{[["Buyer", order.buyer_name], ["Buyer type", titleCase(order.buyer_type)], ["Total", cash(order.total_amount)], ["Created", order.created_at], ["Confirmed", order.confirmed_at]].map(([key, value]) => <div key={String(key)}><dt className="detail-label">{String(key)}</dt><dd className="detail-value">{label(value)}</dd></div>)}</dl></SectionCard>
    <SectionCard title="Produce items and traceability"><div className="space-y-5 p-5">{items.map((item) => { const collections = Array.isArray(item.collections) ? item.collections as Row[] : []; return <article key={String(item.id)} className="rounded-lg border border-[var(--line)] p-4"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Crop", item.crop_name], ["Farmer", item.farmer_name], ["Farm", item.farm_name], ["Season", item.season_name], ["Quantity", `${String(item.quantity)} ${String(item.unit ?? "")}`], ["Unit price", cash(item.unit_price)], ["Total", cash(item.total_amount)], ["Status", titleCase(item.status)]].map(([key, value]) => <div key={String(key)}><dt className="detail-label">{String(key)}</dt><dd className="detail-value">{label(value)}</dd></div>)}</dl>{collections.length > 0 && <div className="mt-4 space-y-3"><h3 className="text-xs font-semibold">Collection and weighing records</h3>{collections.map((collection) => <div key={String(collection.id)} className="rounded-md bg-[var(--surface-soft)] p-3"><p className="text-xs">{titleCase(collection.delivery_method)} · {String(collection.quantity_collected)} collected · {label(collection.collection_date)} · {titleCase(collection.status)}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{label(collection.location)} {label(collection.notes)}</p>{Array.isArray(collection.weighings) && (collection.weighings as Row[]).map((weighing) => <p key={String(weighing.id)} className="mt-2 text-xs">Net weighed: {String(weighing.net_weight)} {String(weighing.unit)} · {label(weighing.weighed_by_name)}</p>)}{permitted(session, "procurement.weigh") && ["CONFIRMED", "PROCESSING"].includes(String(order.status)) && <form onSubmit={(event) => void recordWeighing(String(collection.id), event)} className="mt-3 grid gap-2 sm:grid-cols-4"><TextField name="gross_weight" label="Gross weight" type="number" required /><TextField name="tare_weight" label="Tare weight" type="number" required /><TextField name="unit" label="Unit" defaultValue={String(item.unit ?? "KG")} /><TextField name="evidence_document" label="Evidence document ID (optional)" /><button disabled={busy} className="secondary-button">Record weighing</button></form>}</div>)}</div>}{permitted(session, "procurement.collect") && ["CONFIRMED", "PROCESSING"].includes(String(order.status)) && <form onSubmit={(event) => void recordCollection(String(item.id), event)} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><TextField name="collection_date" label="Collection / delivery date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><TextField name="quantity_collected" label="Quantity collected" type="number" required /><TextField name="location" label="Location" /><label className="field-label">Method<select className="field-control" name="delivery_method"><option value="PICKUP">Collection / pickup</option><option value="DELIVERY">Delivery</option></select></label><TextField name="notes" label="Notes" /><button disabled={busy} className="secondary-button">Record collection / delivery</button></form>}</article>; })}{!items.length && <p className="text-xs text-[var(--muted)]">This order has no produce items.</p>}</div></SectionCard>
    <SectionCard title="Settlement records"><div className="space-y-4 p-5">{orderSettlements.map((settlement) => <article key={String(settlement.id)} className="rounded-lg border border-[var(--line)] p-4"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Settlement", settlement.settlement_reference], ["Farmer", settlement.farmer_name], ["Amount", cash(settlement.amount)], ["Payment status", titleCase(settlement.payment_status)], ["Payment reference", settlement.payment_reference], ["Verification note", settlement.verification_reason]].map(([key, value]) => <div key={String(key)}><dt className="detail-label">{String(key)}</dt><dd className="detail-value">{label(value)}</dd></div>)}</dl>{canUploadSettlementEvidence && ["PENDING", "REJECTED"].includes(String(settlement.payment_status)) && <form onSubmit={(event) => void settlementAction(settlement, event)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><TextField name="payment_reference" label="Bank / payout reference" required /><label className="field-label">Evidence document type<select className="field-control" name="document_type" required><option value="">Choose type…</option>{documentTypes.map((type) => <option key={String(type.id)} value={String(type.id)}>{String(type.name)}</option>)}</select></label><label className="field-label">Payout evidence file<input className="field-control !h-auto !py-2" type="file" name="evidence_file" required /></label><button disabled={busy || !documentTypes.length} className="secondary-button">Upload and submit payout evidence</button></form>}{permitted(session, "procurement.settlement.verify") && settlement.payment_status === "PENDING_VERIFICATION" && <form onSubmit={(event) => void settlementAction(settlement, event)} className="mt-4 grid gap-3 sm:grid-cols-3"><label className="field-label">Decision<select className="field-control" name="decision"><option value="VERIFY">Verify payout</option><option value="REJECT">Reject evidence</option></select></label><TextField name="reason" label="Verification note / rejection reason" /><button disabled={busy} className="secondary-button">Record verification</button></form>}</article>)}{!orderSettlements.length && <p className="text-xs text-[var(--muted)]">Settlement records are generated when purchase fulfillment is completed.</p>}</div></SectionCard>
    <SectionCard title="Order actions"><div className="flex flex-wrap gap-2 p-5">{order.status === "DRAFT" && permitted(session, "procurement.confirm") && <button disabled={busy} className="primary-button" onClick={() => void action("confirm")}><Check size={14} /> Confirm order</button>}{["CONFIRMED", "PROCESSING"].includes(String(order.status)) && permitted(session, "procurement.complete") && <button disabled={busy} className="primary-button" onClick={() => void action("complete")}><Check size={14} /> Complete order</button>}{!permitted(session, "procurement.confirm") && !permitted(session, "procurement.complete") && <p className="text-xs text-[var(--muted)]">Your role can view this order but cannot change its status.</p>}</div></SectionCard>
  </>;
}

function ForecastPage({ session }: { session: SessionInfo }) {
  const [forecast, setForecast] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const canRead = permitted(session, "procurement.read");
  useEffect(() => {
    let active = true;
    if (!canRead) return;
    apiRequest<Row>("procurement/forecast").then((data) => { if (active) setForecast(data); }).catch((reason: unknown) => { if (active) setError(reason); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canRead]);
  if (!canRead) return <Denied permission="procurement.read" title="Supply forecast" />;
  if (loading) return <Loading />;
  const supply = getRows(forecast?.supply_forecast);
  const history = getRows(forecast?.procurement_history);
  return <>
    <Link href="/procurement" className="back-link"><ArrowLeft size={14} /> Back to procurement</Link>
    <PageTitle eyebrow="Procurement / Planning" title="Supply forecast" description="Published and planned supply by crop alongside procurement history." />
    <Notice error={error} success="" />
    <SectionCard title="Available supply forecast"><DataTable columns={[{ key: "crop__name", label: "Crop" }, { key: "season__name", label: "Season" }, { key: "unit", label: "Unit" }, { key: "harvest_status", label: "Harvest" }, { key: "expected_harvest_at", label: "Expected harvest" }, { key: "total_quantity", label: "Listed quantity" }, { key: "committed_quantity", label: "Committed" }, { key: "available_quantity", label: "Available" }, { key: "offers_count", label: "Offers" }]} rows={supply} empty="No accepted or published supply is available." /></SectionCard>
    <SectionCard title="Completed procurement history"><DataTable columns={[{ key: "produce_offer__crop__name", label: "Crop" }, { key: "produce_offer__season__name", label: "Season" }, { key: "produce_offer__unit", label: "Unit" }, { key: "procurement_order__buyer_type", label: "Buyer / market channel" }, { key: "procured_quantity", label: "Purchased quantity" }, { key: "procured_amount", label: "Procurement total", money: true }, { key: "purchases_count", label: "Orders" }]} rows={history} empty="No completed procurement history is available." /></SectionCard>
  </>;
}

function Denied({ permission, title }: { permission: string; title: string }) {
  return <div className="surface-panel max-w-xl p-6"><div className="eyebrow">Access restricted</div><h1 className="mt-2 text-lg font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Your account does not have the <span className="mono text-[11px]">{permission}</span> permission for this operation. If you believe this is incorrect, contact an administrator.</p></div>;
}
