"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiRequest, errorMessage } from "@/lib/api";
import type { RoleGrant, SessionUser } from "@/lib/api";
import { createUuid } from "@/lib/uuid";

type Row = Record<string, unknown>;
type SessionInfo = { user: SessionUser; permissions: string[]; roles: RoleGrant[]; permissionError?: boolean };
type Props = { path: string; session: SessionInfo; onToast: (message: string) => void };

function can(session: SessionInfo, permission: string) {
  const isSuperAdmin = session.user.user_type?.toUpperCase() === "SUPER_ADMIN"
    || session.roles.some((role) => role.code === "SUPER_ADMIN");
  return isSuperAdmin || (!session.permissionError && session.permissions.includes(permission));
}

function rowString(row: Row, key: string, fallback = "—") {
  const value = row[key];
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return String((value as Row).name ?? (value as Row).id ?? fallback);
  return String(value);
}

function money(value: unknown, currency = "NGN") {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
    : "—";
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
  return <label className="field-label">{label}<input className="field-control" name={name} type={type} required={required} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} defaultValue={defaultValue} />{hint && <span className="field-hint">{hint}</span>}</label>;
}

function TextArea({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <label className="field-label">{label}<textarea className="field-control min-h-24" name={name} required={required} /></label>;
}

function PrimaryButton({ children, disabled = false, type = "submit", onClick }: { children: ReactNode; disabled?: boolean; type?: "submit" | "button"; onClick?: () => void }) {
  return <button type={type} disabled={disabled} onClick={onClick} className="primary-button disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;
}

function StatePill({ value }: { value: unknown }) {
  const status = rowString({ status: value }, "status");
  return <span className={`status-pill ${["OPEN", "PUBLISHED", "APPROVED", "CONFIRMED", "SETTLED", "VERIFIED", "COMPLETED"].includes(status) ? "status-good" : ["CLOSED", "REJECTED", "FAILED"].includes(status) ? "status-bad" : "status-wait"}`}>{status.replaceAll("_", " ")}</span>;
}

function referenceRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === "object" && Array.isArray((payload as Row).results)) return (payload as Row).results as Row[];
  return [];
}

function ProjectReferenceSelect({ name, label, endpoint, permission, session, required = false, onSelect }: { name: string; label: string; endpoint: string; permission: string; required?: boolean; session: SessionInfo; onSelect?: (row: Row | null) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const allowed = can(session, permission);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    apiRequest<unknown>(endpoint)
      .then((payload) => { if (active) setRows(referenceRows(payload)); })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [allowed, endpoint, retry]);
  return <label className="field-label">{label}<select className="field-control" name={name} defaultValue="" required={required} disabled={!allowed || Boolean(error)} onChange={(event) => {
    if (onSelect) onSelect(rows.find((row) => rowString(row, "id") === event.target.value) ?? null);
  }}><option value="">Select {label.toLowerCase()}…</option>{rows.map((row) => {
    const id = rowString(row, "id", "");
    const display = name === "farm"
      ? `${rowString(row, "name", "Farm")}${row.farmer_name ? ` · ${rowString(row, "farmer_name")}` : ""}`
      : name === "crop"
        ? rowString(row, "name", rowString(row, "crop_name"))
        : `${rowString(row, "name")}${row.year ? ` · ${rowString(row, "year")}` : ""}`;
    return id ? <option key={id} value={id}>{display}</option> : null;
  })}</select>{Boolean(error) && <span role="alert" className="field-hint text-[#a34e3d]">Could not load choices: {errorMessage(error)} <button type="button" className="font-semibold underline" onClick={() => { setError(null); setRetry((value) => value + 1); }}>Retry</button></span>}</label>;
}

function ProjectLocationFields({ farm }: { farm: Row | null }) {
  const [states, setStates] = useState<Row[]>([]);
  const [lgas, setLgas] = useState<Row[]>([]);
  const [wards, setWards] = useState<Row[]>([]);
  const [communities, setCommunities] = useState<Row[]>([]);
  const [stateId, setStateId] = useState("");
  const [lgaId, setLgaId] = useState("");
  const [wardId, setWardId] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [stateName, setStateName] = useState("");
  const [lgaName, setLgaName] = useState("");
  const [wardName, setWardName] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!farm) return;
    const selectedFarm = farm;
    let active = true;
    async function populateLocation() {
      try {
        const availableStates = await apiRequest<Row[]>("geography/states");
        const selectedState = availableStates.find((item) =>
          (selectedFarm.state_id && String(item.id) === String(selectedFarm.state_id))
          || (!selectedFarm.state_id && rowString(item, "name").toLocaleLowerCase() === rowString(selectedFarm, "state_name", "").toLocaleLowerCase()),
        );
        if (!selectedState) {
          if (active) {
            setStateId("");
            setStateName("");
            setLgaId(""); setWardId(""); setCommunityId("");
            setLgaName(""); setWardName(""); setCommunityName("");
            setLgas([]); setWards([]); setCommunities([]);
            setError(null);
          }
          return;
        }

        let availableLgas: Row[] = [];
        let selectedLga: Row | undefined;
        let availableWards: Row[] = [];
        let selectedWard: Row | undefined;
        let availableCommunities: Row[] = [];
        let selectedCommunity: Row | undefined;

        if (selectedFarm.lga_id || selectedFarm.lga_name) {
          availableLgas = await apiRequest<Row[]>(`geography/states/${String(selectedState.id)}/lgas`);
          selectedLga = availableLgas.find((item) =>
            (selectedFarm.lga_id && String(item.id) === String(selectedFarm.lga_id))
            || (!selectedFarm.lga_id && rowString(item, "name").toLocaleLowerCase() === rowString(selectedFarm, "lga_name", "").toLocaleLowerCase()),
          );
        }
        if (selectedLga && (selectedFarm.ward_id || selectedFarm.ward_name)) {
          availableWards = await apiRequest<Row[]>(`geography/lgas/${String(selectedLga.id)}/wards`);
          selectedWard = availableWards.find((item) =>
            (selectedFarm.ward_id && String(item.id) === String(selectedFarm.ward_id))
            || (!selectedFarm.ward_id && rowString(item, "name").toLocaleLowerCase() === rowString(selectedFarm, "ward_name", "").toLocaleLowerCase()),
          );
        }
        if (selectedWard && (selectedFarm.community_id || selectedFarm.community_name)) {
          availableCommunities = await apiRequest<Row[]>(`geography/wards/${String(selectedWard.id)}/communities`);
          selectedCommunity = availableCommunities.find((item) =>
            (selectedFarm.community_id && String(item.id) === String(selectedFarm.community_id))
            || (!selectedFarm.community_id && rowString(item, "name").toLocaleLowerCase() === rowString(selectedFarm, "community_name", "").toLocaleLowerCase()),
          );
        }

        if (active) {
          setStates(availableStates);
          setLgas(availableLgas);
          setWards(availableWards);
          setCommunities(availableCommunities);
          setStateId(String(selectedState.id));
          setStateName(rowString(selectedState, "name", ""));
          setLgaId(selectedLga ? String(selectedLga.id) : "");
          setLgaName(selectedLga ? rowString(selectedLga, "name", "") : "");
          setWardId(selectedWard ? String(selectedWard.id) : "");
          setWardName(selectedWard ? rowString(selectedWard, "name", "") : "");
          setCommunityId(selectedCommunity ? String(selectedCommunity.id) : "");
          setCommunityName(selectedCommunity ? rowString(selectedCommunity, "name", "") : "");
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason);
      }
    }
    void populateLocation();
    return () => { active = false; };
  }, [farm]);

  useEffect(() => {
    let active = true;
    apiRequest<Row[]>("geography/states")
      .then((items) => { if (active) { setStates(items); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!stateId) return;
    let active = true;
    apiRequest<Row[]>(`geography/states/${stateId}/lgas`)
      .then((items) => { if (active) { setLgas(items); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [retry, stateId]);
  useEffect(() => {
    if (!lgaId) return;
    let active = true;
    apiRequest<Row[]>(`geography/lgas/${lgaId}/wards`)
      .then((items) => { if (active) { setWards(items); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [retry, lgaId]);
  useEffect(() => {
    if (!wardId) return;
    let active = true;
    apiRequest<Row[]>(`geography/wards/${wardId}/communities`)
      .then((items) => { if (active) { setCommunities(items); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [retry, wardId]);

  function matchName(rows: Row[], text: string) {
    const normalized = text.trim().toLocaleLowerCase();
    return rows.find((row) => rowString(row, "name", "").trim().toLocaleLowerCase() === normalized);
  }
  const location = [
    communityId ? rowString(communities.find((row) => String(row.id) === communityId) ?? {}, "name", "") : "",
    wardId ? rowString(wards.find((row) => String(row.id) === wardId) ?? {}, "name", "") : "",
    lgaId ? rowString(lgas.find((row) => String(row.id) === lgaId) ?? {}, "name", "") : "",
    stateId ? rowString(states.find((row) => String(row.id) === stateId) ?? {}, "name", "") : "",
  ].filter(Boolean).join(", ");

  return <div className="grid gap-3 md:col-span-2 sm:grid-cols-2">
    <label className="field-label">State<input className="field-control" list="project-location-states" value={stateName} required autoComplete="address-level1" placeholder="Search states…" onChange={(event) => {
      const nextName = event.target.value;
      const match = matchName(states, nextName);
      setStateName(nextName);
      setStateId(match ? String(match.id) : "");
      setLgaId(""); setWardId(""); setCommunityId(""); setLgas([]); setWards([]); setCommunities([]);
      setLgaName(""); setWardName(""); setCommunityName("");
    }} /><datalist id="project-location-states">{states.map((row) => <option key={String(row.id)} value={rowString(row, "name", "")} />)}</datalist></label>
    <label className="field-label">LGA<input className="field-control" list="project-location-lgas" value={lgaName} disabled={!stateId} autoComplete="address-level2" placeholder={stateId ? "Search local governments…" : "Select a state first"} onChange={(event) => {
      const nextName = event.target.value;
      const match = matchName(lgas, nextName);
      setLgaName(nextName);
      setLgaId(match ? String(match.id) : "");
      setWardId(""); setCommunityId(""); setWards([]); setCommunities([]);
      setWardName(""); setCommunityName("");
    }} /><datalist id="project-location-lgas">{lgas.map((row) => <option key={String(row.id)} value={rowString(row, "name", "")} />)}</datalist></label>
    <label className="field-label">Ward<input className="field-control" list="project-location-wards" value={wardName} disabled={!lgaId} placeholder={lgaId ? "Search wards…" : "Select an LGA first"} onChange={(event) => {
      const nextName = event.target.value;
      const match = matchName(wards, nextName);
      setWardName(nextName);
      setWardId(match ? String(match.id) : "");
      setCommunityId("");
      setCommunities([]);
      setCommunityName("");
    }} /><datalist id="project-location-wards">{wards.map((row) => <option key={String(row.id)} value={rowString(row, "name", "")} />)}</datalist></label>
    <label className="field-label">Community<input className="field-control" list="project-location-communities" value={communityName} disabled={!wardId} placeholder={wardId ? "Search communities…" : "Select a ward first"} onChange={(event) => {
      const nextName = event.target.value;
      const match = matchName(communities, nextName);
      setCommunityName(nextName);
      setCommunityId(match ? String(match.id) : "");
    }} /><datalist id="project-location-communities">{communities.map((row) => <option key={String(row.id)} value={rowString(row, "name", "")} />)}</datalist></label>
    <input type="hidden" name="location" value={location} />
    {Boolean(error) && <div role="alert" className="flex items-center gap-2 text-xs text-[#a34e3d] md:col-span-2">Could not load location choices: {errorMessage(error)}<button type="button" className="font-semibold underline" onClick={() => { setError(null); setRetry((value) => value + 1); }}>Retry</button></div>}
  </div>;
}

function ProjectCreate({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selectedFarm, setSelectedFarm] = useState<Row | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ""));
    if (!body.location) {
      setError(new Error("Select at least a state to set the project location."));
      setBusy(false);
      return;
    }
    try {
      const project = await apiRequest<Row>("projects/projects", { method: "POST", body });
      onToast(`Project ${rowString(project, "project_code")} created as a draft.`);
      router.push(`/projects/${String(project.id)}`);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  return <><PageHeader eyebrow="Projects / Administration" title="Create project" description="Create a draft. Add approved economics before review and publication." /><Feedback error={error} /><Panel title="Project terms"><form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
    <Field name="title" label="Project name" required />
    <ProjectReferenceSelect name="farm" label="Farm" endpoint="farms/farms" permission="farm.read" session={session} required onSelect={setSelectedFarm} />
    <ProjectReferenceSelect name="crop" label="Crop" endpoint="crops/crops" permission="crop.read" session={session} />
    <ProjectReferenceSelect name="season" label="Season" endpoint="seasons" permission="season.read" session={session} />
    <ProjectLocationFields key={String(selectedFarm?.id ?? "no-farm")} farm={selectedFarm} />
    <Field name="duration_start" label="Duration start" type="date" /><Field name="duration_end" label="Duration end" type="date" />
    <Field name="funding_target" label="Funding target" type="number" required /><Field name="minimum_participation" label="Minimum participation" type="number" required />
    <Field name="currency" label="Currency" defaultValue="NGN" required />
    <TextArea name="description" label="Description" /><TextArea name="production_plan" label="Production plan" />
    <TextArea name="use_of_funds" label="Use of funds" /><TextArea name="risk_disclosures" label="Risk disclosures" />
    <div className="md:col-span-2"><PrimaryButton disabled={busy}>{busy ? "Creating…" : "Create draft"}</PrimaryButton></div>
  </form></Panel></>;
}

function ProjectList({ session }: { session: SessionInfo }) {
  const [projects, setProjects] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const rows = await apiRequest<Row[]>("projects/projects");
      setProjects(rows);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const canCreate = can(session, "project.create");

  return <><PageHeader eyebrow="Projects / Opportunities" title="Farm projects" description="Review approved opportunities, project progress, funding, and terms." actions={canCreate ? <Link className="primary-button" href="/projects/new">Create project</Link> : undefined} />
    <Feedback error={error} />
    {loading ? <p className="py-8 text-xs text-[var(--muted)]">Loading projects…</p> : projects.length === 0 ? <Panel title="No opportunities"><p className="text-xs text-[var(--muted)]">No approved opportunities are available for this account.</p></Panel> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <Link key={rowString(project, "id")} href={`/projects/${rowString(project, "id")}`} className="surface-panel block p-5 transition hover:-translate-y-0.5 hover:border-[#b8cdbd]">
      <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{rowString(project, "project_code")}</p><h2 className="mt-2 text-base font-semibold">{rowString(project, "title")}</h2></div><StatePill value={project.status} /></div>
      <p className="mt-3 text-xs text-[var(--muted)]">{rowString(project, "location")} · {rowString(project, "crop_name", "Crop not specified")}</p>
      <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">{rowString(project, "description", "Project information and participation terms.")}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4 text-xs"><div><span className="block text-[var(--muted)]">Target</span><strong className="mt-1 block">{money(project.funding_target, rowString(project, "currency", "NGN"))}</strong></div><div><span className="block text-[var(--muted)]">Raised</span><strong className="mt-1 block">{money(project.funding_raised, rowString(project, "currency", "NGN"))}</strong></div></div>
    </Link>)}</div>}
  </>;
}

function ProjectDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const [project, setProject] = useState<Row | null>(null);
  const [updates, setUpdates] = useState<Row[]>([]);
  const [funding, setFunding] = useState<Row | null>(null);
  const [documentTypes, setDocumentTypes] = useState<Row[]>([]);
  const [pendingDocumentId, setPendingDocumentId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [economicsFormula, setEconomicsFormula] = useState<"PRINCIPAL_PERCENT" | "PROFIT_SHARE">("PRINCIPAL_PERCENT");
  const isAdmin = can(session, "project.approve");
  const canInvest = can(session, "investment.create");
  const canUploadProjectDocuments = can(session, "project.update") && can(session, "document.create");
  const load = useCallback(async () => {
    try {
      const [projectData, fundingData, updatesData] = await Promise.all([
        apiRequest<Row>(`projects/projects/${id}`),
        apiRequest<Row>(`projects/projects/${id}/funding`),
        apiRequest<Row[]>(`projects/projects/${id}/updates`),
      ]);
      setProject(projectData);
      setFunding(fundingData);
      setUpdates(updatesData);
    } catch (requestError) {
      setError(requestError);
    }
  }, [id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!canUploadProjectDocuments) return;
    let active = true;
    apiRequest<Row[]>("document-types")
      .then((items) => { if (active) setDocumentTypes(items.filter((item) => item.active !== false)); })
      .catch((requestError: unknown) => { if (active) setError(requestError); });
    return () => { active = false; };
  }, [canUploadProjectDocuments]);

  async function transition(action: string) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`projects/projects/${id}/${action}`, { method: "POST", body: {} });
      onToast(`Project ${action} action completed.`);
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function configureEconomics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const formula = String(form.get("formula_type"));
    const parameters = formula === "PRINCIPAL_PERCENT"
      ? { return_percent: String(form.get("return_percent")) }
      : { profit_pool: String(form.get("profit_pool")), investor_share_percent: String(form.get("investor_share_percent")) };
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`projects/projects/${id}/economics`, {
        method: "POST",
        body: { formula_type: formula, parameters, fees: { project_fee: String(form.get("project_fee") || "0") } },
      });
      onToast("Approved economics version saved. Existing participations retain their snapshots.");
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function recordShariaMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`projects/projects/${id}/sharia`, {
        method: "POST",
        body: Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== "")),
      });
      formElement.reset();
      onToast("Sharia governance metadata recorded. This does not constitute certification.");
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function uploadProjectDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);
    try {
      let documentId = pendingDocumentId;
      if (!documentId) {
        const documentType = String(form.get("document_type") ?? "");
        const file = form.get("project_document");
        if (!documentType || !(file instanceof File) || !file.size) {
          throw new Error("Choose a document type and file.");
        }
        if (file.size > 25 * 1024 * 1024) throw new Error("Project documents must be 25 MB or smaller.");
        const mimeType = file.type || "application/octet-stream";
        if (!["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) {
          throw new Error("Choose a PDF, JPEG, or PNG document.");
        }
        const bytes = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const started = await apiRequest<{ document?: { id?: string }; id?: string; upload_url?: string }>("documents/documents", {
          method: "POST",
          body: {
            document_type: documentType,
            owner_type: "user",
            owner_id: session.user.id,
            file_name: file.name,
            mime_type: mimeType,
            file_size: file.size,
            checksum,
            sensitivity: "STANDARD",
          },
        });
        documentId = String(started.document?.id ?? started.id ?? "");
        if (!documentId || !started.upload_url) throw new Error("The API did not return an upload reference.");
        const uploaded = await fetch(started.upload_url, {
          method: "PUT",
          headers: { "Content-Type": mimeType, "x-amz-meta-sha256": checksum },
          body: bytes,
        });
        if (!uploaded.ok) throw new Error(`Storage upload failed (${uploaded.status}). The document was not confirmed.`);
        await apiRequest(`documents/documents/${documentId}/complete`, { method: "POST", body: {} });
        setPendingDocumentId(documentId);
      }

      await apiRequest(`projects/projects/${id}/documents`, {
        method: "POST",
        body: { document_id: documentId },
      });
      setPendingDocumentId("");
      formElement.reset();
      onToast("Project document uploaded and linked.");
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function openProjectDocument(documentId: string) {
    const newWindow = window.open("about:blank", "_blank");
    if (!newWindow) {
      setError(new Error("Allow pop-ups to open this project document."));
      return;
    }
    newWindow.opener = null;
    setError(null);
    try {
      const result = await apiRequest<{ download_url: string }>(`projects/projects/${id}/documents/${documentId}/download-url`);
      newWindow.location.href = result.download_url;
    } catch (requestError) {
      newWindow.close();
      setError(requestError);
    }
  }

  async function invest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const method = String(form.get("payment_method"));
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const result = await apiRequest<{ investment: Row; payment: Row }>("investments/investments", {
        method: "POST",
        body: {
          project: id,
          principal_amount: String(form.get("principal_amount")),
          payment_method: method,
          payment_reference: String(form.get("payment_reference") ?? ""),
          idempotency_key: createUuid(),
        },
      });
      const authorizationUrl = result.payment.authorization_url;
      if (typeof authorizationUrl === "string" && authorizationUrl) {
        window.location.assign(authorizationUrl);
        return;
      }
      setMessage(`Participation ${rowString(result.investment, "investment_reference")} is pending payment verification.`);
      onToast("Manual transfer recorded. It remains pending until verified by an administrator.");
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function postUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`projects/projects/${id}/updates`, {
        method: "POST", body: Object.fromEntries(form.entries()),
      });
      onToast("Project progress update published.");
      event.currentTarget.reset();
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  if (error && !project) return <><PageHeader eyebrow="Projects" title="Project unavailable" /><Feedback error={error} /></>;
  if (!project) return <p className="py-8 text-xs text-[var(--muted)]">Loading project…</p>;
  const status = rowString(project, "status");
  const economics = project.economics && typeof project.economics === "object" ? project.economics as Row : null;
  const sharia = Array.isArray(project.sharia_reviews) ? project.sharia_reviews as Row[] : [];
  const docs = Array.isArray(project.document_details) ? project.document_details as Row[] : [];
  const parameters = economics?.parameters && typeof economics.parameters === "object" ? economics.parameters as Row : {};
  const formulaType = rowString(economics ?? {}, "formula_type");
  const publicProject = ["PUBLISHED", "OPEN", "FULLY_SUBSCRIBED", "ACTIVE", "COMPLETED", "SETTLED"].includes(status);
  const canManageProjectDocuments = canUploadProjectDocuments && status !== "CLOSED";
  const lifecycleActions = status === "DRAFT" ? ["submit"] : status === "REVIEW" ? ["approve"] : status === "APPROVED" ? ["publish"] : status === "FULLY_SUBSCRIBED" ? ["activate"] : status === "ACTIVE" ? ["complete"] : ["close"];
  const latestShariaReviewApproved = rowString(sharia[0] ?? {}, "review_status") === "APPROVED";
  const governanceRequirementsMet = latestShariaReviewApproved && docs.length > 0;

  return <><PageHeader eyebrow={`Projects / ${rowString(project, "project_code")}`} title={rowString(project, "title")} description={`${rowString(project, "location")} · ${rowString(project, "farmer_name")} · ${rowString(project, "crop_name", "Crop not specified")}`} actions={<StatePill value={status} />} />
    <Feedback error={error} success={message} />
    <div className="grid gap-4 lg:grid-cols-3"><Panel title="Participation"><div className="space-y-3 text-xs"><p><span className="text-[var(--muted)]">Target</span><strong className="float-right">{money(project.funding_target, rowString(project, "currency", "NGN"))}</strong></p><p><span className="text-[var(--muted)]">Raised</span><strong className="float-right">{money(funding?.raised, rowString(project, "currency", "NGN"))}</strong></p><p><span className="text-[var(--muted)]">Reserved</span><strong className="float-right">{money(funding?.reserved, rowString(project, "currency", "NGN"))}</strong></p><p><span className="text-[var(--muted)]">Minimum</span><strong className="float-right">{money(project.minimum_participation, rowString(project, "currency", "NGN"))}</strong></p><p><span className="text-[var(--muted)]">Duration</span><strong className="float-right">{rowString(project, "duration_start")} – {rowString(project, "duration_end")}</strong></p></div></Panel>
      <Panel title="Project terms"><div className="space-y-3 text-xs leading-5"><p><strong>Description</strong><br />{rowString(project, "description")}</p><p><strong>Production plan</strong><br />{rowString(project, "production_plan")}</p><p><strong>Use of funds</strong><br />{rowString(project, "use_of_funds")}</p><p><strong>Risks</strong><br />{rowString(project, "risk_disclosures")}</p></div></Panel>
      <Panel title="Economics and governance"><div className="space-y-3 text-xs leading-5">
        <p><strong>Approved formula:</strong> {economics ? formulaType === "PROFIT_SHARE" ? "Profit Share" : formulaType === "PRINCIPAL_PERCENT" ? "Principal Percentage" : formulaType.replaceAll("_", " ") : "Not configured"}</p>
        {economics && <div className="grid gap-3 sm:grid-cols-2">
          {(formulaType === "PROFIT_SHARE"
            ? [["Profit pool", parameters.profit_pool], ["Investor share (%)", parameters.investor_share_percent]]
            : [["Return percentage", parameters.return_percent]]
          ).map(([label, value]) => <label key={String(label)} className="field-label">{String(label)}<input className="field-control" value={String(value ?? "")} disabled /></label>)}
          <p className="sm:col-span-2"><strong>Version:</strong> {rowString(economics, "version")}</p>
        </div>}
        <p><strong>Sharia metadata:</strong> {sharia.length ? `${rowString(sharia[0], "structure_type")} · ${rowString(sharia[0], "review_status")}` : "Not recorded"}</p>
        <p className="text-[var(--muted)]">Governance status is metadata only; it is not an automatic Sharia certification.</p>
        <p><strong>Documents:</strong> {docs.length ? `${docs.length} linked` : "No documents linked"}</p>
      </div></Panel>
    </div>
    {isAdmin && <Panel title="Project lifecycle">
      {lifecycleActions.some((action) => ["approve", "publish"].includes(action)) && !governanceRequirementsMet && <p className="mb-3 text-xs leading-5 text-[#964d3e]">Before approval or publication, record an approved Sharia governance review and link at least one confirmed supporting document.</p>}
      <div className="flex flex-wrap gap-2">{lifecycleActions.map((action) => <PrimaryButton key={action} type="button" disabled={busy || (["approve", "publish"].includes(action) && !governanceRequirementsMet)} onClick={() => void transition(action)}>{action[0].toUpperCase() + action.slice(1)}</PrimaryButton>)}</div>
    </Panel>}
    {can(session, "project.economics.manage") && <Panel title="Versioned approved economics">
      <form onSubmit={configureEconomics} className="grid gap-3 md:grid-cols-2">
        <label className="field-label">Formula<select className="field-control" name="formula_type" value={economicsFormula} onChange={(event) => setEconomicsFormula(event.target.value === "PROFIT_SHARE" ? "PROFIT_SHARE" : "PRINCIPAL_PERCENT")}><option value="PRINCIPAL_PERCENT">Principal percentage</option><option value="PROFIT_SHARE">Profit Share</option></select></label>
        {economicsFormula === "PRINCIPAL_PERCENT"
          ? <Field name="return_percent" label="Return percentage" type="number" defaultValue="0" />
          : <><Field name="profit_pool" label="Profit pool" type="number" defaultValue="0" /><Field name="investor_share_percent" label="Investor share (%)" type="number" defaultValue="0" /></>}
        <Field name="project_fee" label="Configured fee" type="number" defaultValue="0" />
        <p className="field-hint md:col-span-2">
          {economicsFormula === "PRINCIPAL_PERCENT"
            ? "Principal Percentage: expected profit is the participation amount multiplied by the return percentage."
            : "Profit Share: expected profit is the project profit pool multiplied by the investor’s proportion of the project funding target, then multiplied by the investor share percentage. If no target is set, confirmed participation is used as the denominator."}
        </p>
        <p className="field-hint md:col-span-2">Configured fee is deducted from the expected settlement. Saving creates a new version; existing participations keep their saved economics.</p>
        <div className="md:col-span-2"><PrimaryButton disabled={busy}>Save approved economics version</PrimaryButton></div>
      </form>
    </Panel>}
    {isAdmin && <Panel title="Sharia metadata">
      {sharia.length > 0 && <div className="mb-4 space-y-3 border-b border-[var(--line)] pb-4 text-xs leading-5">{sharia.map((review) => <div key={rowString(review, "id")}><strong>{rowString(review, "structure_type")}</strong> · {rowString(review, "review_status")}<p>{rowString(review, "terms", "No terms recorded.")}</p>{rowString(review, "risk_disclosure", "") && <p>Risks: {rowString(review, "risk_disclosure")}</p>}<p className="text-[var(--muted)]">Reviewer: {rowString(review, "reviewer_name", "Recorded by an authorized user")} · {rowString(review, "approval_date", "No approval date")}</p></div>)}</div>}
      <form onSubmit={recordShariaMetadata} className="grid gap-3 md:grid-cols-2">
        <label className="field-label">Structure type<select className="field-control" name="structure_type" required defaultValue="Mudarabah">{["Mudarabah", "Musharakah", "Murabaha", "Ijarah", "Qard Hasan", "Other approved structure"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="field-label">Review status<select className="field-control" name="review_status" defaultValue="PENDING">{["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
        <Field name="reviewer_name" label="Reviewer name" />
        <label className="field-label">Supporting document<select className="field-control" name="supporting_document" defaultValue=""><option value="">No supporting document selected</option>{docs.map((document) => <option key={rowString(document, "id")} value={rowString(document, "id")}>{rowString(document, "file_name")}</option>)}</select></label>
        <div className="md:col-span-2"><TextArea name="terms" label="Structure terms" /></div>
        <div className="md:col-span-2"><TextArea name="risk_disclosure" label="Review notes and risks" /></div>
        <p className="field-hint md:col-span-2">Recording an approved review does not certify the project. Actual Sharia certification must come from qualified professional advisers.</p>
        <div className="md:col-span-2"><PrimaryButton disabled={busy}>{busy ? "Saving…" : "Record Sharia metadata"}</PrimaryButton></div>
      </form>
    </Panel>}
    <Panel title="Project documents">
      {docs.length ? <div className="mb-4 divide-y divide-[var(--line)]">{docs.map((document) => <div key={rowString(document, "id")} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"><div><strong>{rowString(document, "file_name")}</strong><p className="text-[var(--muted)]">{rowString(document, "document_type")}</p></div>{publicProject && <button type="button" className="secondary-button" onClick={() => void openProjectDocument(rowString(document, "id"))}>Open document</button>}</div>)}</div> : <p className="mb-4 text-xs text-[var(--muted)]">No supporting documents have been linked.</p>}
      {canManageProjectDocuments ? <form onSubmit={uploadProjectDocument} className="grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2">
        <label className="field-label">Document type<select className="field-control" name="document_type" required defaultValue=""><option value="">Choose a type…</option>{documentTypes.map((type) => <option key={rowString(type, "id")} value={rowString(type, "id")}>{rowString(type, "name")}</option>)}</select></label>
        <label className="field-label">Upload document<input className="field-control !h-auto !py-2" name="project_document" type="file" accept="application/pdf,image/jpeg,image/png" required={!pendingDocumentId} disabled={Boolean(pendingDocumentId)} /><span className="field-hint">{pendingDocumentId ? "Upload completed; retrying the link will finish attaching this file." : "PDF, JPG, or PNG · up to 25 MB"}</span></label>
        <div className="md:col-span-2"><PrimaryButton disabled={busy}>{busy ? "Uploading…" : pendingDocumentId ? "Retry linking document" : "Upload and link document"}</PrimaryButton></div>
      </form> : canUploadProjectDocuments && status === "CLOSED" ? <p className="field-hint">Documents cannot be added to a closed project.</p> : null}
    </Panel>
    {canInvest && status === "OPEN" && <Panel title="Participate in this project"><form onSubmit={invest} className="grid gap-3 md:grid-cols-2"><Field name="principal_amount" label="Participation amount" type="number" required /><label className="field-label">Payment method<select className="field-control" name="payment_method"><option value="PAYSTACK">Online payment</option><option value="MANUAL_TRANSFER">Manual bank transfer</option></select></label><Field name="payment_reference" label="Bank transfer reference" hint="Required for manual bank transfer. Submission remains pending until admin verification." /><div className="md:col-span-2"><PrimaryButton disabled={busy}>{busy ? "Submitting…" : "Continue"}</PrimaryButton></div></form></Panel>}
    {isAdmin && ["ACTIVE", "COMPLETED", "SETTLED"].includes(status) && <Panel title="Publish field progress"><form onSubmit={postUpdate} className="grid gap-3 md:grid-cols-2"><Field name="title" label="Update title" required /><Field name="update_type" label="Update type" defaultValue="FIELD_PROGRESS" required /><div className="md:col-span-2"><TextArea name="content" label="Progress summary" required /></div><div className="md:col-span-2"><PrimaryButton disabled={busy}>Publish update</PrimaryButton></div></form></Panel>}
    <Panel title="Project updates">{updates.length ? <ul className="divide-y divide-[var(--line)]">{updates.map((update) => <li key={rowString(update, "id")} className="py-3 first:pt-0"><strong className="text-xs">{rowString(update, "title")}</strong><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{rowString(update, "content")}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{rowString(update, "published_at")}</p></li>)}</ul> : <p className="text-xs text-[var(--muted)]">No progress updates yet.</p>}</Panel>
  </>;
}

function InvestorPages({ path, session, onToast }: Props) {
  const id = path.split("/").filter(Boolean)[1];
  const [investors, setInvestors] = useState<Row[]>([]);
  const [investor, setInvestor] = useState<Row | null>(null);
  const [documentTypes, setDocumentTypes] = useState<Row[]>([]);
  const [pendingKycRecordId, setPendingKycRecordId] = useState("");
  const [uploadedKycTypes, setUploadedKycTypes] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = can(session, "investor.kyc.review");
  const canSubmitKyc = can(session, "investor.kyc.submit");
  const requiredDocumentTypes = documentTypes.filter((type) => Boolean(type.is_required_for_kyc));
  const load = useCallback(async () => {
    try {
      if (id) setInvestor(await apiRequest<Row>(`investors/investors/${id}`));
      else setInvestors(await apiRequest<Row[]>("investors/investors"));
    } catch (requestError) {
      setError(requestError);
    }
  }, [id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!canSubmitKyc) return;
    let active = true;
    apiRequest<Row[]>("document-types")
      .then((types) => { if (active) setDocumentTypes(types); })
      .catch((requestError: unknown) => { if (active) setError(requestError); });
    return () => { active = false; };
  }, [canSubmitKyc]);

  async function submitKyc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const selectedDocuments = requiredDocumentTypes.map((type) => ({
        typeId: String(type.id),
        file: form.get(`document_${String(type.id)}`),
      })).filter((item): item is { typeId: string; file: File } => item.file instanceof File && item.file.size > 0);
      if (requiredDocumentTypes.some((type) => !selectedDocuments.some((item) => item.typeId === String(type.id) && item.file.size > 0))) {
        throw new Error("Choose a file for every required KYC document.");
      }
      if (!requiredDocumentTypes.length) {
        const typeId = String(form.get("optional_document_type") ?? "");
        const file = form.get("optional_document");
        if (!typeId || !(file instanceof File) || !file.size) throw new Error("Choose a document type and file.");
        selectedDocuments.push({ typeId, file });
      }

      let recordId = pendingKycRecordId;
      if (!recordId) {
        const record = await apiRequest<Row>("kyc/records", {
          method: "POST",
          body: {
            id_type: form.get("id_type"),
            id_number: form.get("id_number"),
            verification_method: "MANUAL",
          },
        });
        recordId = String(record.id ?? "");
        if (!recordId) throw new Error("The API did not return the new KYC record.");
        setPendingKycRecordId(recordId);
      }

      for (const { typeId, file } of selectedDocuments) {
        if (uploadedKycTypes.has(typeId)) continue;
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} exceeds the 25 MB document limit.`);
        const mimeType = file.type || "application/octet-stream";
        if (!["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) {
          throw new Error(`${file.name} must be a PDF, JPG, or PNG file.`);
        }
        const bytes = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const start = await apiRequest<{ document?: { id?: string }; id?: string; upload_url?: string }>("documents/documents", {
          method: "POST",
          body: {
            document_type: typeId,
            owner_type: "user",
            owner_id: session.user.id,
            file_name: file.name,
            mime_type: mimeType,
            file_size: file.size,
            checksum,
            sensitivity: "STANDARD",
          },
        });
        const documentId = String(start.document?.id ?? start.id ?? "");
        if (!documentId || !start.upload_url) throw new Error("The API did not return an upload reference.");
        const uploaded = await fetch(start.upload_url, {
          method: "PUT",
          headers: { "Content-Type": mimeType, "x-amz-meta-sha256": checksum },
          body: bytes,
        });
        if (!uploaded.ok) throw new Error(`Storage upload failed (${uploaded.status}). The KYC document was not confirmed.`);
        await apiRequest(`documents/documents/${documentId}/complete`, { method: "POST", body: {} });
        await apiRequest(`kyc/records/${recordId}/documents`, { method: "POST", body: { document_id: documentId } });
        setUploadedKycTypes((current) => new Set(current).add(typeId));
      }

      const currentKycRecord = await apiRequest<Row>(`kyc/records/${recordId}`);
      const kycStatus = rowString(currentKycRecord, "status");
      if (["DRAFT", "RETURNED"].includes(kycStatus)) {
        await apiRequest(`kyc/records/${recordId}/submit`, { method: "POST", body: {} });
      } else if (!["SUBMITTED", "VERIFIED"].includes(kycStatus)) {
        throw new Error(`This KYC record cannot be submitted from its current ${kycStatus} status.`);
      }
      await apiRequest(`investors/investors/${id}/kyc`, {
        method: "POST",
        body: { kyc_record_id: recordId },
      });
      setPendingKycRecordId("");
      setUploadedKycTypes(new Set());
      onToast("KYC submitted for review.");
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function reviewKyc(decision: "VERIFIED" | "REJECTED") {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`investors/investors/${id}/kyc`, { method: "POST", body: { decision } });
      onToast(`Investor KYC ${decision.toLowerCase()}.`);
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  if (!id) return <><PageHeader eyebrow="Investors / Profiles" title="Investor profiles" description="Review your investor verification status and financial profile." /><Feedback error={error} />
    <Panel title="Profiles">{investors.length ? <div className="divide-y divide-[var(--line)]">{investors.map((row) => <Link key={rowString(row, "id")} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0" href={`/investors/${rowString(row, "id")}`}><span><strong className="block text-xs">{rowString(row, "full_name")}</strong><span className="text-[11px] text-[var(--muted)]">{rowString(row, "email")}</span></span><span className="flex items-center gap-2"><StatePill value={row.kyc_status} /><span className="mono text-[10px] text-[var(--muted)]">{rowString(row, "id")}</span></span></Link>)}</div> : <p className="text-xs text-[var(--muted)]">No investor profile is available.</p>}</Panel></>;
  if (!investor) return <><PageHeader eyebrow="Investors" title="Investor profile" /><Feedback error={error} /></>;
  const hasAttachedKycRecord = Boolean(investor.kyc_record);
  return <><PageHeader eyebrow="Investors / Profile" title={rowString(investor, "full_name")} description={rowString(investor, "email")} actions={<StatePill value={investor.kyc_status} />} /><Feedback error={error} />
    <Panel title="KYC and account status"><div className="grid gap-3 text-xs sm:grid-cols-2"><p><span className="text-[var(--muted)]">Investor ID</span><br />{rowString(investor, "id")}</p><p><span className="text-[var(--muted)]">Review status</span><br />{rowString(investor, "kyc_status")}</p><p><span className="text-[var(--muted)]">Attached KYC record</span><br />{rowString(investor, "kyc_record")}</p><p><span className="text-[var(--muted)]">Rejection reason</span><br />{rowString(investor, "kyc_rejection_reason")}</p></div>
      {!isAdmin && canSubmitKyc && !hasAttachedKycRecord && rowString(investor, "kyc_status") !== "VERIFIED" && <form onSubmit={submitKyc} className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
        <label className="field-label">Identity document type<select className="field-control" name="id_type" required defaultValue=""><option value="">Choose type…</option>{["NIN", "BVN", "VOTER_CARD", "DRIVERS_LICENSE", "PASSPORT", "OTHER"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
        <Field name="id_number" label="Identity number" required />
        {requiredDocumentTypes.length > 0
          ? requiredDocumentTypes.map((type) => <label key={String(type.id)} className="field-label">Upload {rowString(type, "name")}<input className="field-control !h-auto !py-2" name={`document_${String(type.id)}`} type="file" accept="application/pdf,image/jpeg,image/png" required disabled={uploadedKycTypes.has(String(type.id))} /><span className="field-hint">{uploadedKycTypes.has(String(type.id)) ? "Uploaded and attached." : "PDF, JPG, or PNG · up to 25 MB"}</span></label>)
          : <><label className="field-label">Document type<select className="field-control" name="optional_document_type" required defaultValue=""><option value="">Choose type…</option>{documentTypes.map((type) => <option key={String(type.id)} value={String(type.id)}>{rowString(type, "name")}</option>)}</select></label><label className="field-label">Upload identity document<input className="field-control !h-auto !py-2" name="optional_document" type="file" accept="application/pdf,image/jpeg,image/png" required /><span className="field-hint">PDF, JPG, or PNG · up to 25 MB</span></label></>}
        <div className="sm:col-span-2"><PrimaryButton disabled={busy}>{busy ? "Uploading and submitting…" : "Upload and submit for review"}</PrimaryButton></div>
      </form>}
      {!isAdmin && !canSubmitKyc && !hasAttachedKycRecord && <p className="mt-5 border-t border-[var(--line)] pt-4 text-xs leading-5 text-[var(--muted)]">KYC upload is unavailable because this account lacks the investor KYC submission permission. Contact an administrator.</p>}
      {isAdmin && rowString(investor, "kyc_status") === "PENDING" && <div className="mt-5 flex gap-2"><PrimaryButton type="button" disabled={busy} onClick={() => void reviewKyc("VERIFIED")}>Approve KYC</PrimaryButton><button className="secondary-button" disabled={busy} onClick={() => void reviewKyc("REJECTED")}>Reject</button></div>}
    </Panel>
    <div className="flex flex-wrap gap-3"><Link className="secondary-button" href="/investments">View investments</Link><Link className="secondary-button" href="/withdrawals">View withdrawals</Link></div>
  </>;
}

function InvestmentsPage({ session, onToast }: Props) {
  const [investments, setInvestments] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState("");
  const [statement, setStatement] = useState<Row | null>(null);
  const canAdmin = can(session, "investment.confirm") || can(session, "investment.approve");
  const load = useCallback(async () => {
    try {
      setInvestments(await apiRequest<Row[]>("investments/investments"));
    } catch (requestError) {
      setError(requestError);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function action(id: string, name: string, body: Row = {}) {
    setBusyId(id);
    setError(null);
    try {
      await apiRequest(`investments/investments/${id}/${name}`, { method: "POST", body });
      onToast(`Investment ${name} completed.`);
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyId("");
    }
  }

  async function verifyPayment(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const result = await apiRequest<Row>(`investments/investments/${id}/verify-payment`, {
        method: "POST",
        body: {},
      });
      const investment = result.investment && typeof result.investment === "object"
        ? result.investment as Row
        : {};
      onToast(`Paystack check completed. Investment status: ${rowString(investment, "status")}.`);
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyId("");
    }
  }

  async function openStatement(id: string) {
    setError(null);
    try {
      setStatement(await apiRequest<Row>(`investments/investments/${id}/statement`));
    } catch (requestError) {
      setError(requestError);
    }
  }

  return <><PageHeader eyebrow="Investor / Investments" title="Participation history" description="Track payment verification, project economics, ROI snapshots, receipts, and statements." /><Feedback error={error} />
    <Panel title="Investments">{investments.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Reference</th><th>Project</th><th>Participation</th><th>Expected profit</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead><tbody>{investments.map((row) => {
      const id = rowString(row, "id");
      const status = rowString(row, "status");
      return <tr key={id}><td className="mono">{rowString(row, "investment_reference")}</td><td>{rowString(row, "project_title")}</td><td>{money(row.principal_amount, rowString(row, "currency", "NGN"))}</td><td>{money(row.expected_return, rowString(row, "currency", "NGN"))}</td><td>{rowString(row, "payment_method")}<br /><span className="text-[10px] text-[var(--muted)]">{rowString(row, "payment_reference")}</span></td><td><StatePill value={status} /></td><td><div className="flex flex-wrap gap-1">
        <button className="secondary-button px-2 py-1 text-[10px]" onClick={() => void openStatement(id)}>Statement</button>
        {can(session, "investment.roi.read") && <Link className="secondary-button px-2 py-1 text-[10px]" href={`/investments/${id}/roi`}>ROI</Link>}
        {status === "PENDING" && row.payment_method === "PAYSTACK" && <button className="secondary-button px-2 py-1 text-[10px]" disabled={busyId === id} onClick={() => void verifyPayment(id)}>Verify Paystack payment</button>}
        {canAdmin && status === "PENDING" && row.payment_method === "MANUAL_TRANSFER" && <button className="secondary-button px-2 py-1 text-[10px]" disabled={busyId === id} onClick={() => void action(id, "confirm", { decision: "VERIFY" })}>Verify payment</button>}
        {can(session, "investment.approve") && status === "CONFIRMED" && <button className="secondary-button px-2 py-1 text-[10px]" disabled={busyId === id} onClick={() => void action(id, "approve")}>Approve</button>}
      </div></td></tr>;
    })}</tbody></table></div> : <p className="text-xs text-[var(--muted)]">No investment activity is available.</p>}</Panel>
    {statement && <Panel title="Statement"><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-5">{JSON.stringify(statement, null, 2)}</pre></Panel>}
  </>;
}

function PaystackReturnPage() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref") || "";
  const [verification, setVerification] = useState<{
    reference: string;
    attempt: number;
    result?: Row;
    error?: unknown;
  } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (!reference) return () => { active = false; };
    apiRequest<Row>("investments/payments/verify", {
      method: "POST",
      body: { reference },
    }).then((response) => {
      if (active) setVerification({ reference, attempt: retry, result: response });
    }).catch((reason: unknown) => {
      if (active) setVerification({ reference, attempt: retry, error: reason });
    });
    return () => { active = false; };
  }, [reference, retry]);

  const currentVerification = verification?.reference === reference && verification.attempt === retry
    ? verification
    : null;
  const result = currentVerification?.result ?? null;
  const error = !reference
    ? "Paystack did not return a transaction reference. Check your participation history or contact support."
    : currentVerification?.error;
  const busy = Boolean(reference) && !currentVerification;
  const investment = result?.investment && typeof result.investment === "object"
    ? result.investment as Row
    : null;
  const status = rowString(investment ?? {}, "status", "PENDING");
  const detail = status === "CONFIRMED"
    ? "Paystack has confirmed your payment. The investment is awaiting the separate authorized approval step."
    : status === "APPROVED" || status === "ACTIVE"
      ? "Your payment is confirmed and the investment has been approved."
      : status === "FAILED"
        ? "Paystack did not confirm this payment. Contact support if your account was charged."
        : "Paystack has not confirmed this payment yet. You can retry the check or review your participation history.";

  return <><PageHeader eyebrow="Paystack / Payment return" title="Payment status" description={reference ? `Transaction reference ${reference}` : "Checking your Paystack payment"} />
    {error && <Feedback error={error} />}
    {busy ? <Panel title="Verifying payment"><p className="text-xs text-[var(--muted)]">Checking the transaction directly with Paystack…</p></Panel> : <>
      <Panel title="Verification result">
        <div className="flex flex-wrap items-center gap-3"><StatePill value={status} /><span className="text-xs leading-5 text-[var(--muted)]">{detail}</span></div>
        {result && <p className="mt-3 text-xs text-[var(--muted)]">Payment provider status: {rowString(result, "provider_status")} · Payment record: {rowString(result, "payment_status")}</p>}
      </Panel>
      <div className="flex flex-wrap gap-3">
        <Link className="primary-button" href="/investments">View participation history</Link>
        {status === "PENDING" && reference && <button className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Check again</button>}
      </div>
    </>}
  </>;
}

function ROIPage({ id }: { id: string }) {
  const [roi, setRoi] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    apiRequest<Row>(`investments/investments/${id}/roi`).then(setRoi).catch(setError);
  }, [id]);
  return <><PageHeader eyebrow="Investor / Economics" title="ROI and settlement" description="Calculated from the approved economics version captured for this participation." /><Feedback error={error} />
    {roi && <Panel title="Return components"><div className="grid gap-3 text-xs sm:grid-cols-2"><p>Participation<strong className="mt-1 block">{money(roi.participation, rowString(roi, "currency", "NGN"))}</strong></p><p>Expected profit<strong className="mt-1 block">{money(roi.expected_profit, rowString(roi, "currency", "NGN"))}</strong></p><p>Configured fees<strong className="mt-1 block">{money(roi.fees, rowString(roi, "currency", "NGN"))}</strong></p><p>Expected settlement<strong className="mt-1 block">{money(roi.expected_settlement, rowString(roi, "currency", "NGN"))}</strong></p><p>Approved formula<strong className="mt-1 block">{rowString(roi, "approved_formula")} · v{rowString(roi, "economics_version")}</strong></p></div><h3 className="mb-2 mt-5 text-xs font-semibold">Recorded settlements</h3><pre className="overflow-x-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(roi.settlements ?? [], null, 2)}</pre></Panel>}
  </>;
}

function WithdrawalsPage({ session, onToast }: Props) {
  const [withdrawals, setWithdrawals] = useState<Row[]>([]);
  const [investments, setInvestments] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = can(session, "withdrawal.approve");
  const load = useCallback(async () => {
    try {
      const [withdrawalRows, investmentRows, payoutRows] = await Promise.all([
        apiRequest<Row[]>("withdrawals/withdrawals"),
        can(session, "withdrawal.create") ? apiRequest<Row[]>("investments/investments") : Promise.resolve([]),
        can(session, "withdrawal.create") ? apiRequest<Row[]>("investors/payout-accounts") : Promise.resolve([]),
      ]);
      setWithdrawals(withdrawalRows);
      setInvestments(investmentRows);
      setAccounts(payoutRows);
    } catch (requestError) {
      setError(requestError);
    }
  }, [session]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiRequest("investors/payout-accounts", { method: "POST", body: Object.fromEntries(form.entries()) });
      event.currentTarget.reset();
      onToast("Payout account saved. An administrator must verify it before withdrawal requests can use it.");
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function createWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`investors/investors/${rowString(investments[0] ?? {}, "investor")}/withdrawals`, {
        method: "POST",
        body: {
          investment: String(form.get("investment")),
          amount: String(form.get("amount")),
          type: String(form.get("type")),
          payout_account: String(form.get("payout_account")),
        },
      });
      event.currentTarget.reset();
      onToast("Withdrawal request submitted for approval.");
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function advance(id: string, action: string) {
    const body = action === "complete"
      ? { financial_transaction_id: window.prompt("Enter the completed, reconciled payout transaction UUID") ?? "" }
      : {};
    if (action === "complete" && !body.financial_transaction_id) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`withdrawals/withdrawals/${id}/${action}`, { method: "POST", body });
      onToast(`Withdrawal ${action} action completed.`);
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  const investorId = investments.length ? rowString(investments[0], "investor") : "";
  return <><PageHeader eyebrow="Investor / Finance" title="Withdrawals" description="Submit partial or full withdrawal requests and follow their review and payout status." /><Feedback error={error} />
    {!isAdmin && can(session, "withdrawal.create") && <><Panel title="Payout accounts"><form onSubmit={createAccount} className="grid gap-3 md:grid-cols-2"><Field name="bank_code" label="Bank code" required /><Field name="bank_name" label="Bank name" required /><Field name="account_number" label="Account number" required /><Field name="account_name" label="Account name" required /><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_default" value="true" /> Set as default account</label><div><PrimaryButton disabled={busy}>Save account</PrimaryButton></div></form><div className="mt-4 divide-y divide-[var(--line)]">{accounts.map((account) => <p key={rowString(account, "id")} className="py-2 text-xs">{rowString(account, "bank_name")} · {rowString(account, "account_number_masked")} · {rowString(account, "account_name")} · <StatePill value={account.account_name_verified ? "VERIFIED" : "PENDING"} /></p>)}</div></Panel>
      <Panel title="Request a withdrawal"><form onSubmit={createWithdrawal} className="grid gap-3 md:grid-cols-2"><label className="field-label">Investment<select className="field-control" name="investment" required defaultValue=""><option value="">Select…</option>{investments.filter((item) => ["APPROVED", "ACTIVE", "SETTLED"].includes(rowString(item, "status"))).map((item) => <option key={rowString(item, "id")} value={rowString(item, "id")}>{rowString(item, "project_title")} · {rowString(item, "investment_reference")}</option>)}</select></label><Field name="amount" label="Amount" type="number" required /><label className="field-label">Withdrawal type<select className="field-control" name="type"><option value="PARTIAL">Part withdrawal</option><option value="FULL">Full withdrawal</option></select></label><label className="field-label">Verified payout account<select className="field-control" name="payout_account" required defaultValue=""><option value="">Select…</option>{accounts.filter((account) => account.account_name_verified && account.status === "ACTIVE").map((account) => <option key={rowString(account, "id")} value={rowString(account, "id")}>{rowString(account, "bank_name")} · {rowString(account, "account_number_masked")}</option>)}</select></label><div className="md:col-span-2"><PrimaryButton disabled={busy || !investorId || !accounts.some((account) => account.account_name_verified && account.status === "ACTIVE")}>Submit request</PrimaryButton></div></form><p className="mt-3 text-[10px] text-[var(--muted)]">Approval is only available after the project is completed; payout completion requires a matched completed financial transaction.</p></Panel></>}
    <Panel title="Withdrawal requests">{withdrawals.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Reference</th><th>Project</th><th>Type</th><th>Amount</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead><tbody>{withdrawals.map((row) => {
      const id = rowString(row, "id");
      const state = rowString(row, "status");
      const actionName = state === "REQUESTED" ? "approve" : state === "APPROVED" ? "process" : state === "PROCESSING" ? "complete" : "";
      return <tr key={id}><td className="mono">{rowString(row, "withdrawal_reference")}</td><td>{rowString(row, "project_title")}</td><td>{rowString(row, "type")}</td><td>{money(row.amount, rowString(row, "currency", "NGN"))}</td><td><StatePill value={state} /></td><td>{rowString(row, "requested_at")}</td><td>{isAdmin && actionName && <button className="secondary-button px-2 py-1 text-[10px]" disabled={busy} onClick={() => void advance(id, actionName)}>{actionName}</button>}</td></tr>;
    })}</tbody></table></div> : <p className="text-xs text-[var(--muted)]">No withdrawal requests are available.</p>}</Panel>
  </>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">{eyebrow}</div><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.02em] sm:text-[30px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>}</div>{actions}</div>;
}

export default function InvestmentPages(props: Props) {
  const segments = props.path.split("/").filter(Boolean);
  const section = segments[0];
  if (section === "projects") {
    if (segments[1] === "new") return <ProjectCreate session={props.session} onToast={props.onToast} />;
    if (segments[1]) return <ProjectDetail id={segments[1]} session={props.session} onToast={props.onToast} />;
    return <ProjectList session={props.session} />;
  }
  if (section === "investors") return <InvestorPages {...props} />;
  if (section === "investments") {
    if (segments[1] === "paystack-return") return <PaystackReturnPage />;
    if (segments[2] === "roi" && segments[1]) return <ROIPage id={segments[1]} />;
    return <InvestmentsPage {...props} />;
  }
  if (section === "withdrawals") return <WithdrawalsPage {...props} />;
  return null;
}
