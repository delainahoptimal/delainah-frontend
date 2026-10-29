"use client";

import {
  ArrowLeft, ArrowRight, Check, ClipboardList, LoaderCircle, Plus, RefreshCw,
  Tractor, Wheat,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiRequest, errorMessage } from "@/lib/api";

type Row = Record<string, unknown>;
type SessionInfo = { user: { user_type?: string }; permissions: string[]; permissionError?: boolean; roles?: { scopes?: string[] }[] };

function permitted(session: SessionInfo, permission: string) {
  return !session.permissionError && session.permissions.includes(permission);
}

function hasOperationsScope(session: SessionInfo) {
  return session.roles?.some((role) => role.scopes?.some((scope) => scope === "OPS" || scope === "ALL")) ?? false;
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

function TextField({ name, label: fieldLabel, type = "text", required = false, hint, defaultValue }: { name: string; label: string; type?: string; required?: boolean; hint?: string; defaultValue?: string }) {
  return <label className="field-label">{fieldLabel}<input className="field-control" name={name} type={type} required={required} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} defaultValue={defaultValue} />{hint && <span className="field-hint">{hint}</span>}</label>;
}

function SelectField({ name, label: fieldLabel, rows, required = false, includeBlank = true }: { name: string; label: string; rows: Row[]; required?: boolean; includeBlank?: boolean }) {
  return <label className="field-label">{fieldLabel}<select className="field-control" name={name} required={required} defaultValue=""><>{includeBlank && <option value="">Select…</option>}{rows.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.service_name ?? row.farm_name ?? row.asset_code ?? row.offer_reference ?? row.id)}</option>)}</></select></label>;
}

function SectionCard({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="surface-panel mb-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{description}</p>}</div>{actions}</div>{children}</section>;
}

function ModuleLinks({ session }: { session: SessionInfo }) {
  const links = [
    { href: "/service-requests", title: "Service requests", permission: ["service_request.read", "service_request.create"], icon: ClipboardList, note: "Request, schedule, and complete farm services." },
    { href: "/machinery", title: "Machinery", permission: ["machinery.read", "machinery.create"], icon: Tractor, note: "Track machinery, availability, and assignments." },
    { href: "/produce", title: "Produce listings", permission: ["produce.read", "produce.create"], icon: Wheat, note: "Manage farmer produce offers." },
    { href: "/procurement", title: "Procurement", permission: ["procurement.read", "procurement.create"], icon: ClipboardList, note: "Manage orders, settlements, and forecasts." },
  ].filter((link) => link.permission.some((permission) => permitted(session, permission)));
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{links.map(({ href, title, icon: Icon, note }) => <Link key={href} href={href} className="surface-panel group p-4 transition hover:-translate-y-0.5 hover:border-[#b8cdbd]"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf5ee] text-[var(--leaf)]"><Icon size={17} /></span><span className="mt-3 block text-sm font-semibold">{title}<ArrowRight size={13} className="ml-1 inline transition group-hover:translate-x-1" /></span><span className="mt-1 block text-[11px] leading-5 text-[var(--muted)]">{note}</span></Link>)}</div>;
}

export default function OperationsPages({ path, session, onToast }: { path: string; session: SessionInfo; onToast: (message: string) => void }) {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "service-requests") {
    return segments.length > 1 ? <ServiceRequestDetail id={segments[1]} session={session} onToast={onToast} /> : <ServiceRequestsPage session={session} onToast={onToast} />;
  }
  if (segments[0] === "machinery") return <MachineryPage session={session} onToast={onToast} />;
  if (segments[0] === "produce") return <ProducePage session={session} onToast={onToast} />;
  if (segments[0] === "procurement" && segments[1] === "forecast") return <ForecastPage session={session} />;
  if (segments[0] === "procurement") return segments.length > 1 ? <ProcurementDetail id={segments[1]} session={session} onToast={onToast} /> : <ProcurementPage session={session} onToast={onToast} />;
  return <><PageTitle eyebrow="Farm operations" title="Farm operations" description="Coordinate field services, equipment, produce sales, and procurement in one workspace." /><ModuleLinks session={session} /></>;
}

function ServiceRequestsPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [requests, setRequests] = useState<Row[]>([]);
  const [services, setServices] = useState<Row[]>([]);
  const [farms, setFarms] = useState<Row[]>([]);
  const [crops, setCrops] = useState<Row[]>([]);
  const [seasons, setSeasons] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const canRead = permitted(session, "service_request.read");
  const canCreate = permitted(session, "service_request.create");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [requestData, serviceData, farmData, cropData, seasonData] = await Promise.all([
        canRead ? apiRequest<unknown>("service-requests/service-requests") : Promise.resolve([]),
        canRead || canCreate ? apiRequest<unknown>("services") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("farms/farms") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("crops/crops") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("seasons") : Promise.resolve([]),
      ]);
      setRequests(getRows(requestData)); setServices(getRows(serviceData)); setFarms(getRows(farmData)); setCrops(getRows(cropData)); setSeasons(getRows(seasonData));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [canRead, canCreate]);

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
    try {
      const result = await apiRequest<Row>("service-requests/service-requests", { method: "POST", body });
      setSuccess(`Service request ${String(result.request_reference ?? "")} created.`);
      formElement.reset(); await load(); onToast("Service request created.");
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  if (!canRead && !canCreate) return <Denied permission="service_request.read or service_request.create" title="Service requests" />;
  return <>
    <PageTitle eyebrow="Services / Field operations" title="Service requests" description="Request farm services, track approvals and scheduling, and follow work through completion." actions={<div className="flex gap-2"><Link className="secondary-button" href="/offline-sync">Offline logging</Link><button className="icon-button" onClick={() => void load()} aria-label="Refresh service requests"><RefreshCw size={14} /></button></div>} />
    <Notice error={error} success="" />
    {canRead && <SectionCard title="Service request queue" description="Your results are limited by your role and assigned-farmer scope.">
      {loading ? <Loading /> : <DataTable columns={[{ key: "request_reference", label: "Request" }, { key: "farmer_name", label: "Farmer" }, { key: "farm_name", label: "Farm" }, { key: "service_name", label: "Service" }, { key: "scheduled_date", label: "Scheduled" }, { key: "estimated_cost", label: "Estimate", money: true }, { key: "status", label: "Status", status: true }]} rows={requests} empty="No service requests are available." />}
      {requests.length > 0 && <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-5 py-3">{requests.map((request) => <Link key={String(request.id)} href={`/service-requests/${String(request.id)}`} className="secondary-button">{String(request.request_reference ?? "View request")}<ArrowRight size={13} /></Link>)}</div>}
    </SectionCard>}
    {canRead && <SectionCard title="Service catalogue" description="Active services and their pricing."><DataTable columns={[{ key: "name", label: "Service" }, { key: "category", label: "Category" }, { key: "pricing_method", label: "Pricing" }, { key: "default_unit_price", label: "Unit price", money: true }]} rows={services} empty="No active services are listed." /></SectionCard>}
    {canCreate && <SectionCard title="Create a service request" description="Farmers can request service for their own farm. Field Officers must select the assigned farmer.">
      {success && <Notice error={null} success={success} />}
      <form onSubmit={createRequest} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {session.user.user_type !== "FARMER" && <TextField name="farmer" label="Farmer profile ID" required hint="Enter the UUID for a farmer you are authorized to support." />}
        <SelectField name="farm" label="Farm" rows={farms} required />
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const canReadHistory = permitted(session, "service_request.history");
  const canAssignMachinery = permitted(session, "service_request.assign");
  const can = (permission: string) => permitted(session, permission);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiRequest<Row>(`service-requests/service-requests/${id}`);
      setRequest(data);
      if (canReadHistory) {
        try { setHistory(getRows(await apiRequest<unknown>(`service-requests/service-requests/${id}/history`))); }
        catch (reason) { setError(reason); }
      }
      if (canAssignMachinery) setMachinery(getRows(await apiRequest<unknown>("machinery/machinery")));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [id, canReadHistory, canAssignMachinery]);
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
        ["Farmer", request.farmer_name], ["Farm", request.farm_name], ["Service", request.service_name], ["Crop", request.crop_name], ["Season", request.season_name],
        ["Requested acreage", request.requested_acreage], ["Estimated cost", cash(request.estimated_cost)], ["Scheduled date", request.scheduled_date],
        ["Customer phone", request.customer_phone], ["Notes", request.notes],
      ].map(([key, value]) => <div key={String(key)}><dt className="detail-label">{String(key)}</dt><dd className="detail-value">{label(value)}</dd></div>)}</dl>
    </SectionCard>
    <SectionCard title="Available actions">
      <div className="flex flex-wrap gap-2 p-5">
        {status === "DRAFT" && can("service_request.submit") && <button disabled={busy} onClick={() => void act("submit")} className="primary-button"><Check size={14} /> Submit</button>}
        {status === "REQUESTED" && can("service_request.approve") && <button disabled={busy} onClick={() => void act("approve")} className="primary-button"><Check size={14} /> Approve</button>}
        {["REQUESTED", "APPROVED"].includes(status) && can("service_request.schedule") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act("schedule", { scheduled_date: data.get("scheduled_date"), notes: data.get("notes") }); }}><label className="field-label">Schedule date<input className="field-control" type="date" name="scheduled_date" required /></label><label className="field-label">Schedule note<input className="field-control" name="notes" /></label><button disabled={busy} className="secondary-button">Schedule</button></form>}
        {["SCHEDULED", "APPROVED"].includes(status) && can("service_request.assign") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act("assign", { machinery: data.get("machinery"), ...(data.get("operator") ? { operator: data.get("operator") } : {}) }); }}><label className="field-label">Machinery<input className="field-control" name="machinery" list="operations-machinery" placeholder="Select asset" required /></label><datalist id="operations-machinery">{machinery.map((asset) => <option key={String(asset.id)} value={String(asset.id)}>{String(asset.asset_code)} · {String(asset.name)}</option>)}</datalist><label className="field-label">Operator ID (optional)<input className="field-control" name="operator" /></label><button disabled={busy} className="secondary-button">Assign</button></form>}
        {["IN_PROGRESS", "SCHEDULED"].includes(status) && can("service_request.complete") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void act("complete", Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== ""))); }}><label className="field-label">Actual acreage<input className="field-control" name="actual_acreage" type="number" min="0" step="any" /></label><label className="field-label">Actual cost (NGN)<input className="field-control" name="actual_cost" type="number" min="0" step="any" /></label><label className="field-label">Completion notes<input className="field-control" name="completion_notes" /></label><button disabled={busy} className="primary-button">Mark completed</button></form>}
        {["REQUESTED", "APPROVED", "SCHEDULED"].includes(status) && can("service_request.reject") && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const reason = new FormData(event.currentTarget).get("reason"); void act("reject", { reason }); }}><label className="field-label">Rejection reason<input className="field-control" name="reason" minLength={3} required /></label><button disabled={busy} className="danger-button">Reject</button></form>}
        {busy && <span className="flex items-center gap-2 text-xs text-[var(--muted)]"><LoaderCircle size={14} className="animate-spin" />Saving…</span>}
        {!busy && !["DRAFT", "REQUESTED", "APPROVED", "SCHEDULED", "IN_PROGRESS"].some((value) => value === status && ["service_request.submit", "service_request.approve", "service_request.schedule", "service_request.assign", "service_request.complete", "service_request.reject"].some(can)) && <p className="text-xs text-[var(--muted)]">No actions are available for your role and this request status.</p>}
      </div>
    </SectionCard>
    {can("service_request.history") && <SectionCard title="Status history"><DataTable columns={[{ key: "old_status", label: "Previous status" }, { key: "new_status", label: "New status", status: true }, { key: "changed_by_name", label: "Changed by" }, { key: "reason", label: "Reason" }, { key: "created_at", label: "Date" }]} rows={history} empty="No status history is available." /></SectionCard>}
  </>;
}

function MachineryPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [assets, setAssets] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [editingAsset, setEditingAsset] = useState<Row | null>(null);
  const canRead = permitted(session, "machinery.read");
  const canCreate = permitted(session, "machinery.create");
  const canUpdate = permitted(session, "machinery.update");
  const canReadAssignmentHistory = canRead && hasOperationsScope(session);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setAssets(getRows(await apiRequest<unknown>("machinery/machinery"))); }
    catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!canRead) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [canRead, load]);
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
  if (!canRead && !canCreate) return <Denied permission="machinery.read or machinery.create" title="Machinery" />;
  return <>
    <PageTitle eyebrow="Services / Mechanization" title="Machinery" description="Review the machinery fleet, update asset availability, and inspect service assignments." actions={canRead ? <button className="icon-button" onClick={() => void load()} aria-label="Refresh machinery"><RefreshCw size={14} /></button> : undefined} />
    <Notice error={error} success={success} />
    {canRead && <SectionCard title="Fleet and availability">
      {loading ? <Loading /> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Asset</th><th>Machine</th><th>Type</th><th>Location</th><th>Condition</th><th>Status</th>{canReadAssignmentHistory && <th>Assignments</th>}{canUpdate && <th>Manage</th>}</tr></thead><tbody>{assets.map((asset) => <tr key={String(asset.id)}><td className="mono">{String(asset.asset_code)}</td><td>{label(asset.name)}</td><td>{titleCase(asset.type)}</td><td>{label(asset.location)}</td><td>{titleCase(asset.condition)}</td><td><span className="status-pill status-neutral">{titleCase(asset.status)}</span></td>{canReadAssignmentHistory && <td><button className="secondary-button min-h-8" onClick={() => setSelected(String(asset.id))}>View history</button></td>}{canUpdate && <td><div className="flex items-center gap-1"><button className="secondary-button min-h-8" onClick={() => setEditingAsset(asset)}>Edit details</button><select className="field-control h-8 min-w-32" disabled={busy} value={String(asset.status)} aria-label={`Set availability for ${String(asset.asset_code)}`} onChange={(event) => void updateAvailability(String(asset.id), event.target.value)}>{["AVAILABLE", "IN_USE", "MAINTENANCE", "DECOMMISSIONED"].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></div></td>}</tr>)}</tbody></table>{!assets.length && <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No machinery assets found.</p>}</div>}
    </SectionCard>}
    {canUpdate && editingAsset && <SectionCard title={`Edit ${String(editingAsset.asset_code)}`} actions={<button className="secondary-button" onClick={() => setEditingAsset(null)}>Cancel</button>}><form onSubmit={updateAsset} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><TextField name="name" label="Name" defaultValue={String(editingAsset.name ?? "")} /><TextField name="type" label="Type" defaultValue={String(editingAsset.type ?? "")} /><TextField name="serial_number" label="Serial number" defaultValue={String(editingAsset.serial_number ?? "")} /><TextField name="location" label="Location" defaultValue={String(editingAsset.location ?? "")} /><TextField name="condition" label="Condition" defaultValue={String(editingAsset.condition ?? "")} /><button disabled={busy} className="primary-button">Save machinery</button></form></SectionCard>}
    {selected && <SectionCard title="Assignment history" actions={<button className="secondary-button" onClick={() => setSelected("")}>Close</button>}><DataTable columns={[{ key: "service_request", label: "Service request" }, { key: "operator_name", label: "Operator" }, { key: "assigned_by_name", label: "Assigned by" }, { key: "assigned_at", label: "Assigned at" }, { key: "returned_at", label: "Returned at" }, { key: "status", label: "Status", status: true }]} rows={assignments} empty="No assignments recorded for this asset." /></SectionCard>}
    {canCreate && <SectionCard title="Register machinery"><form onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><TextField name="asset_code" label="Asset code" required /><TextField name="name" label="Name" required /><TextField name="type" label="Type" required hint="For example: TRACTOR." /><TextField name="serial_number" label="Serial number" /><TextField name="location" label="Location" /><TextField name="condition" label="Condition" /><label className="field-label">Initial status<select className="field-control" name="status" defaultValue="AVAILABLE">{["AVAILABLE", "IN_USE", "MAINTENANCE", "DECOMMISSIONED"].map((status) => <option key={status}>{status}</option>)}</select></label><div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="primary-button"><Plus size={14} /> Add machinery</button></div></form></SectionCard>}
  </>;
}

function ProducePage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [offers, setOffers] = useState<Row[]>([]);
  const [farms, setFarms] = useState<Row[]>([]);
  const [crops, setCrops] = useState<Row[]>([]);
  const [seasons, setSeasons] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [editingOffer, setEditingOffer] = useState<Row | null>(null);
  const canRead = permitted(session, "produce.read");
  const canCreate = permitted(session, "produce.create");
  const canUpdate = permitted(session, "produce.update");
  const can = (permission: string) => permitted(session, permission);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [offersData, farmsData, cropsData, seasonsData] = await Promise.all([
        canRead ? apiRequest<unknown>("produce/listings") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("farms/farms") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("crops/crops") : Promise.resolve([]),
        canCreate ? apiRequest<unknown>("seasons") : Promise.resolve([]),
      ]);
      setOffers(getRows(offersData)); setFarms(getRows(farmsData)); setCrops(getRows(cropsData)); setSeasons(getRows(seasonsData));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [canRead, canCreate]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess("");
    const formElement = event.currentTarget;
    const body = Object.fromEntries([...new FormData(formElement).entries()].filter(([, value]) => String(value).trim() !== ""));
    if (session.user.user_type === "FARMER") delete body.farmer;
    try { const result = await apiRequest<Row>("produce/listings", { method: "POST", body }); setSuccess(`Produce listing ${String(result.offer_reference ?? "")} created.`); formElement.reset(); onToast("Produce listing created."); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function action(id: string, actionName: string) {
    setBusy(true); setError(null);
    try { await apiRequest(`produce/listings/${id}/${actionName}`, { method: "POST" }); onToast(`Produce listing ${actionName === "publish" ? "published" : "closed"}.`); await load(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
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
  const columns = [{ key: "offer_reference", label: "Listing" }, { key: "farmer_name", label: "Farmer" }, { key: "farm_name", label: "Farm" }, { key: "crop_name", label: "Crop" }, { key: "quantity", label: "Quantity" }, { key: "unit", label: "Unit" }, { key: "asking_price", label: "Asking price", money: true }, { key: "expected_harvest_at", label: "Harvest date" }, { key: "status", label: "Status", status: true }];
  return <>
    <PageTitle eyebrow="Produce / Selling" title="Produce listings" description="Farmers can offer produce for sale; authorized operations users can publish listings and close offers." actions={<button className="icon-button" onClick={() => void load()} aria-label="Refresh listings"><RefreshCw size={14} /></button>} />
    <Notice error={error} success={success} />
    {canRead && <SectionCard title="Current listings">{loading ? <Loading /> : <div className="overflow-x-auto"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{offers.map((offer) => <tr key={String(offer.id)}>{columns.map((column) => <td key={column.key}>{column.status ? <span className={`status-pill ${offer.status === "PUBLISHED" ? "status-good" : "status-wait"}`}>{titleCase(offer.status)}</span> : column.money ? cash(offer[column.key]) : label(offer[column.key])}</td>)}<td><div className="flex gap-1">{canUpdate && ["DRAFT", "SUBMITTED"].includes(String(offer.status)) && <button disabled={busy} className="secondary-button min-h-8" onClick={() => setEditingOffer(offer)}>Edit</button>}{(can("produce.publish") || canCreate) && offer.status !== "PUBLISHED" && <button disabled={busy} className="secondary-button min-h-8" onClick={() => void action(String(offer.id), "publish")}>Publish</button>}{(can("produce.close") || can("produce.archive")) && offer.status !== "CLOSED" && <button disabled={busy} className="secondary-button min-h-8" onClick={() => void action(String(offer.id), "close")}>Close</button>}</div></td></tr>)}</tbody></table>{!offers.length && <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No produce listings found.</p>}</div>}</SectionCard>}
    {editingOffer && <SectionCard title={`Edit ${String(editingOffer.offer_reference)}`} actions={<button className="secondary-button" onClick={() => setEditingOffer(null)}>Cancel</button>}><form onSubmit={updateOffer} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><TextField name="quantity" label="Quantity" type="number" defaultValue={String(editingOffer.quantity ?? "")} /><TextField name="unit" label="Unit" defaultValue={String(editingOffer.unit ?? "")} /><TextField name="expected_harvest_at" label="Expected harvest date" type="date" defaultValue={String(editingOffer.expected_harvest_at ?? "")} /><TextField name="quality_grade" label="Quality grade" defaultValue={String(editingOffer.quality_grade ?? "")} /><TextField name="location" label="Collection location" defaultValue={String(editingOffer.location ?? "")} /><TextField name="asking_price" label="Asking price (NGN)" type="number" defaultValue={String(editingOffer.asking_price ?? "")} /><button disabled={busy} className="primary-button">Save listing</button></form></SectionCard>}
    {canCreate && <SectionCard title="Create produce listing" description="Create a draft listing. Publishing is an explicit action and depends on your role.">
      <form onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {session.user.user_type !== "FARMER" && <TextField name="farmer" label="Farmer profile ID" hint="Optional for assisted listing; enter a farmer UUID if known." />}
        <SelectField name="farm" label="Farm" rows={farms} required /><SelectField name="crop" label="Crop" rows={crops} required /><SelectField name="season" label="Season (optional)" rows={seasons} />
        <TextField name="quantity" label="Quantity" type="number" required /><TextField name="unit" label="Unit" hint="For example KG or TONS." /><TextField name="asking_price" label="Asking price (NGN)" type="number" required />
        <TextField name="expected_harvest_at" label="Expected harvest date" type="date" /><TextField name="quality_grade" label="Quality grade" /><TextField name="location" label="Collection location" />
        <label className="flex items-center gap-2 text-xs font-medium text-[#44564b]"><input type="checkbox" name="publish" value="true" /> Publish immediately if authorized</label>
        <div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="primary-button"><Plus size={14} /> Create listing</button></div>
      </form>
    </SectionCard>}
  </>;
}

function ProcurementPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const [orders, setOrders] = useState<Row[]>([]);
  const [offers, setOffers] = useState<Row[]>([]);
  const [buyers, setBuyers] = useState<Row[]>([]);
  const [orderLines, setOrderLines] = useState([0]);
  const [nextOrderLine, setNextOrderLine] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const canRead = permitted(session, "procurement.read");
  const canCreate = permitted(session, "procurement.create");
  const canReadProduce = permitted(session, "produce.read");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ordersData, offersData, buyersData] = await Promise.all([
        canRead ? apiRequest<unknown>("procurement/records") : Promise.resolve([]),
        canCreate && canReadProduce ? apiRequest<unknown>("produce/listings") : Promise.resolve([]),
        canRead ? apiRequest<unknown>("procurement/buyers") : Promise.resolve([]),
      ]);
      setOrders(getRows(ordersData)); setOffers(getRows(offersData).filter((offer) => offer.status === "PUBLISHED")); setBuyers(getRows(buyersData));
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [canRead, canCreate, canReadProduce]);
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
    <PageTitle eyebrow="Produce / Procurement" title="Procurement" description="Create orders against published produce, review order status, and track settlements and forecasts." actions={<div className="flex gap-2"><Link href="/procurement/forecast" className="secondary-button">View forecast<ArrowRight size={13} /></Link><button className="icon-button" onClick={() => void load()} aria-label="Refresh procurement"><RefreshCw size={14} /></button></div>} />
    <Notice error={error} success={success} />
    {canRead && <SectionCard title="Procurement orders">{loading ? <Loading /> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Order</th><th>Buyer</th><th>Type</th><th>Items</th><th>Total</th><th>Status</th><th>Settlements</th></tr></thead><tbody>{orders.map((order) => <tr key={String(order.id)}><td><Link className="font-semibold text-[var(--leaf)] hover:underline" href={`/procurement/${String(order.id)}`}>{label(order.order_reference)}</Link></td><td>{label(order.buyer_name)}</td><td>{titleCase(order.buyer_type)}</td><td>{Array.isArray(order.items) ? order.items.length : 0}</td><td>{cash(order.total_amount)}</td><td><span className="status-pill status-wait">{titleCase(order.status)}</span></td><td>{Array.isArray(order.settlements) ? order.settlements.map((item) => `${cash((item as Row).amount)} · ${titleCase((item as Row).payment_status)}`).join(", ") || "—" : "—"}</td></tr>)}</tbody></table>{!orders.length && <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No procurement orders found.</p>}</div>}</SectionCard>}
    {canCreate && <SectionCard title="Create procurement order" description="Choose a buyer and add one or more published produce listings to this draft order.">
      <form onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><label className="field-label">Buyer name<input className="field-control" name="buyer_name" list="operations-buyers" required /><datalist id="operations-buyers">{buyers.map((buyer, index) => <option key={`${String(buyer.buyer_name)}-${index}`} value={String(buyer.buyer_name)} />)}</datalist></label><TextField name="buyer_type" label="Buyer type" hint="For example INTERNAL_PROCESSING." />
        <div className="sm:col-span-2 lg:col-span-3"><h3 className="mb-3 text-xs font-semibold">Produce items</h3><div className="space-y-3">{orderLines.map((index) => <div key={index} className="grid items-end gap-3 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"><SelectField name={`produce_offer_${index}`} label="Published produce (optional)" rows={offers} /><TextField name={`quantity_${index}`} label="Quantity" type="number" /><TextField name={`unit_price_${index}`} label="Unit price (NGN)" type="number" />{orderLines.length > 1 && <button type="button" className="secondary-button" onClick={() => setOrderLines((current) => current.filter((value) => value !== index))}>Remove</button>}</div>)}</div><button type="button" className="secondary-button mt-3" onClick={() => { setOrderLines((current) => [...current, nextOrderLine]); setNextOrderLine((current) => current + 1); }}><Plus size={13} /> Add produce item</button></div>
        <div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="primary-button"><Plus size={14} /> Create draft order</button></div></form>
    </SectionCard>}
    {canRead && <SectionCard title="Produce settlements" description="Completion generates pending farmer settlement records; payment processing is handled separately."><DataTable columns={[{ key: "settlement_reference", label: "Settlement" }, { key: "farmer_name", label: "Farmer" }, { key: "amount", label: "Amount", money: true }, { key: "currency", label: "Currency" }, { key: "payment_status", label: "Payment status", status: true }]} rows={settlements} empty="No settlements have been generated." /></SectionCard>}
  </>;
}

function ProcurementDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const [order, setOrder] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setError(null); try { setOrder(await apiRequest<Row>(`procurement/records/${id}`)); } catch (reason) { setError(reason); } }, [id]);
  const canRead = permitted(session, "procurement.read");
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
    <SectionCard title="Produce items"><DataTable columns={[{ key: "crop_name", label: "Crop" }, { key: "farmer_name", label: "Farmer" }, { key: "quantity", label: "Quantity" }, { key: "unit_price", label: "Unit price", money: true }, { key: "total_amount", label: "Total", money: true }, { key: "status", label: "Status", status: true }]} rows={items} empty="This order has no produce items." /></SectionCard>
    <SectionCard title="Settlement records"><DataTable columns={[{ key: "settlement_reference", label: "Settlement" }, { key: "farmer_name", label: "Farmer" }, { key: "amount", label: "Amount", money: true }, { key: "currency", label: "Currency" }, { key: "payment_status", label: "Payment status", status: true }]} rows={orderSettlements} empty="No settlements generated yet." /></SectionCard>
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
    <SectionCard title="Supply by crop"><DataTable columns={[{ key: "crop__name", label: "Crop" }, { key: "unit", label: "Unit" }, { key: "status", label: "Listing status", status: true }, { key: "total_quantity", label: "Quantity" }, { key: "offers_count", label: "Offers" }]} rows={supply} empty="No supply forecast is available." /></SectionCard>
    <SectionCard title="Procurement history"><DataTable columns={[{ key: "produce_offer__crop__name", label: "Crop" }, { key: "procured_quantity", label: "Purchased quantity" }, { key: "procured_amount", label: "Procurement total", money: true }]} rows={history} empty="No procurement history is available." /></SectionCard>
  </>;
}

function Denied({ permission, title }: { permission: string; title: string }) {
  return <div className="surface-panel max-w-xl p-6"><div className="eyebrow">Access restricted</div><h1 className="mt-2 text-lg font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Your account does not have the <span className="mono text-[11px]">{permission}</span> permission for this operation. If you believe this is incorrect, contact an administrator.</p></div>;
}
