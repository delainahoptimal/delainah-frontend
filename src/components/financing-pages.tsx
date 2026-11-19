"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiRequest, errorMessage } from "@/lib/api";
import type { RoleGrant, SessionUser } from "@/lib/api";

type Row = Record<string, unknown>;
type SessionInfo = { user: SessionUser; roles: RoleGrant[]; permissions: string[]; permissionError?: boolean };

function permitted(session: SessionInfo, code: string) {
  return !session.permissionError && session.permissions.includes(code);
}

function rows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === "object" && "results" in payload) {
    const results = (payload as { results?: unknown }).results;
    return Array.isArray(results) ? results as Row[] : [];
  }
  return [];
}

function label(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const record = value as Row;
    return String(record.name ?? record.email ?? record.id ?? "—");
  }
  return String(value);
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="surface-panel p-5 sm:p-6"><h2 className="text-sm font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}

export default function FinancingPages({ session }: { session: SessionInfo }) {
  const [products, setProducts] = useState<Row[]>([]);
  const [applications, setApplications] = useState<Row[]>([]);
  const [farms, setFarms] = useState<Row[]>([]);
  const [farmers, setFarmers] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [assessments, setAssessments] = useState<Row[]>([]);
  const [transactions, setTransactions] = useState<Row[]>([]);
  const [transactionHistories, setTransactionHistories] = useState<Record<string, Row[]>>({});
  const [history, setHistory] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editingProduct, setEditingProduct] = useState<Row | null>(null);
  const [editingApplication, setEditingApplication] = useState<Row | null>(null);
  const [selectedFarmer, setSelectedFarmer] = useState("");

  const canCreateApplication = permitted(session, "financing_application.create");
  const canCreateProduct = permitted(session, "financing_product.create");
  const canUpdateProduct = permitted(session, "financing_product.update");
  const canManageProducts = canCreateProduct || canUpdateProduct;
  const canReadAssessments = permitted(session, "financing_assessment.read");
  const canCreateAssessment = permitted(session, "financing_assessment.create");
  const canReadTransactions = permitted(session, "financing_transaction.read");
  const canCreateTransaction = permitted(session, "financing_transaction.create");
  const canExecuteTransaction = permitted(session, "financing_transaction.execute");
  const canSetFarmer = permitted(session, "financing_application.assess");

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) setError(null); });
    Promise.all([
      permitted(session, "financing_product.read") ? apiRequest<unknown>("financing/products") : Promise.resolve([]),
      permitted(session, "financing_application.read") ? apiRequest<unknown>("financing/applications") : Promise.resolve([]),
      canCreateApplication ? apiRequest<unknown>("farms/farms") : Promise.resolve([]),
      canSetFarmer ? apiRequest<unknown>("farmers/farmers") : Promise.resolve([]),
    ]).then(([productData, applicationData, farmData, farmerData]) => {
      if (!active) return;
      setProducts(rows(productData));
      setApplications(rows(applicationData));
      setFarms(rows(farmData));
      setFarmers(rows(farmerData));
    }).catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [canCreateApplication, canSetFarmer, refresh, session]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const id = String(selected.id);
    const requests: Promise<unknown>[] = [
      permitted(session, "financing_application.history") ? apiRequest<unknown>(`financing/applications/${id}/history`) : Promise.resolve([]),
      canReadAssessments ? apiRequest<unknown>(`financing/applications/${id}/assessments`) : Promise.resolve([]),
      canReadTransactions ? apiRequest<unknown>(`financing/applications/${id}/transactions`) : Promise.resolve([]),
    ];
    Promise.all(requests).then(async ([historyData, assessmentData, transactionData]) => {
      if (!active) return;
      setHistory(rows(historyData));
      setAssessments(rows(assessmentData));
      const transactionRows = rows(transactionData);
      setTransactions(transactionRows);
      if (permitted(session, "financing_transaction.history")) {
        const historyEntries = await Promise.all(transactionRows.map(async (item) => {
          const transactionId = String(item.id);
          const payload = await apiRequest<unknown>(`financing/transactions/${transactionId}/history`);
          return [transactionId, rows(payload)] as const;
        }));
        if (active) setTransactionHistories(Object.fromEntries(historyEntries));
      } else {
        setTransactionHistories({});
      }
    }).catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [canReadAssessments, canReadTransactions, refresh, selected, session]);

  async function mutate(key: string, path: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      await apiRequest<Row>(path, { method, body });
      if (key.startsWith("product")) setEditingProduct(null);
      if (key.startsWith("application")) setEditingApplication(null);
      setRefresh((value) => value + 1);
    } catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const productId = editingProduct ? String(editingProduct.id) : "";
    const payload = {
      name: String(values.name ?? ""),
      structure_type: String(values.structure_type ?? ""),
      description: String(values.description ?? ""),
      currency: String(values.currency ?? "NGN"),
      max_amount: values.max_amount ? String(values.max_amount) : null,
      terms: values.terms ? { summary: String(values.terms) } : {},
    };
    await mutate("product-save", productId ? `financing/products/${productId}` : "financing/products", productId ? "PATCH" : "POST", payload);
  }

  async function saveApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload: Record<string, unknown> = {
      financing_product: String(values.financing_product ?? ""),
      farm: String(values.farm ?? ""),
      purpose: String(values.purpose ?? ""),
      requested_amount: String(values.requested_amount ?? ""),
      requested_asset_or_service: String(values.requested_asset_or_service ?? ""),
    };
    if (!editingApplication && canSetFarmer) payload.farmer = selectedFarmer;
    const applicationId = editingApplication ? String(editingApplication.id) : "";
    await mutate("application-save", applicationId ? `financing/applications/${applicationId}` : "financing/applications", applicationId ? "PATCH" : "POST", payload);
    setSelectedFarmer("");
  }

  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await mutate("assess", `financing/applications/${String(selected.id)}/assessments`, "POST", {
      recommendation: String(values.recommendation ?? ""),
      assessment_data: { notes: String(values.notes ?? ""), risk_rating: String(values.risk_rating ?? "") },
    });
  }

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await mutate("transaction-create", `financing/applications/${String(selected.id)}/transactions`, "POST", {
      transaction_type: String(values.transaction_type),
      amount: String(values.amount),
      currency: String(values.currency || "NGN"),
    });
  }

  async function executeTransaction(event: FormEvent<HTMLFormElement>, transactionId: string) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await mutate(`execute-${transactionId}`, `financing/transactions/${transactionId}/execute`, "POST", {
      financial_transaction: String(values.financial_transaction),
    });
  }

  const availableFarms = farms.filter((farm) => {
    if (!canSetFarmer || !selectedFarmer) return true;
    const owner = farm.farmer_id ?? farm.farmer;
    return String(typeof owner === "object" && owner ? (owner as Row).id : owner) === selectedFarmer;
  });
  const title = <div className="mb-7"><div className="eyebrow">Farm finance / Financing</div><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.02em] sm:text-[30px]">Financing</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Manage financing products, farmer applications, assessments, decisions, and verified disbursement records.</p></div>;

  return <>{title}
    {error && <div role="alert" className="mb-5 rounded-lg border border-[#efc9c0] bg-[#fff6f3] px-4 py-3 text-xs leading-5 text-[#964d3e]">{errorMessage(error)}<button className="ml-3 font-semibold" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}

    {canManageProducts && <Panel title={editingProduct ? "Update financing product" : "Create financing product"}>
      {editingProduct && <button className="mb-3 text-xs font-semibold text-[var(--leaf)]" onClick={() => setEditingProduct(null)}>Cancel editing</button>}
      <form key={String(editingProduct?.id ?? "new-product")} onSubmit={saveProduct} className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">Product name<input className="field-control" name="name" required defaultValue={String(editingProduct?.name ?? "")} /></label>
        <label className="field-label">Finance structure<input className="field-control" name="structure_type" required placeholder="e.g. Murabaha" defaultValue={String(editingProduct?.structure_type ?? "")} /></label>
        <label className="field-label">Maximum amount (optional)<input className="field-control" name="max_amount" type="number" min="0.01" step="0.01" defaultValue={String(editingProduct?.max_amount ?? "")} /></label>
        <label className="field-label">Currency<input className="field-control" name="currency" maxLength={8} required defaultValue={String(editingProduct?.currency ?? "NGN")} /></label>
        <label className="field-label sm:col-span-2">Description<textarea className="field-control min-h-20 py-2" name="description" defaultValue={String(editingProduct?.description ?? "")} /></label>
        <label className="field-label sm:col-span-2">Terms summary<textarea className="field-control min-h-20 py-2" name="terms" defaultValue={String((editingProduct?.terms as Row | undefined)?.summary ?? "")} /></label>
        <div className="sm:col-span-2"><button disabled={busy !== "" || editingProduct && !canUpdateProduct || !editingProduct && !canCreateProduct} className="primary-button">{busy === "product-save" ? "Saving…" : editingProduct ? "Save product" : "Create product"}</button></div>
      </form>
      {products.length > 0 && <div className="mt-5 divide-y divide-[var(--line)]">{products.map((product) => <div key={String(product.id)} className="flex flex-wrap items-center gap-3 py-3 text-xs"><span className="min-w-[180px] flex-1 font-medium">{label(product.name)} · {label(product.structure_type)}</span><span>{product.active ? "Active" : "Inactive"}</span>{canUpdateProduct && <button className="secondary-button !min-h-8" onClick={() => setEditingProduct(product)}>Edit</button>}{permitted(session, product.active ? "financing_product.deactivate" : "financing_product.activate") && <button className="secondary-button !min-h-8" disabled={busy !== ""} onClick={() => void mutate(`product-${String(product.id)}`, `financing/products/${String(product.id)}/${product.active ? "deactivate" : "activate"}`, "POST", {})}>{product.active ? "Deactivate" : "Activate"}</button>}</div>)}</div>}
    </Panel>}

    {canCreateApplication && <Panel title={editingApplication ? "Update draft application" : "Apply for financing"}>
      {editingApplication && <button className="mb-3 text-xs font-semibold text-[var(--leaf)]" onClick={() => setEditingApplication(null)}>Cancel editing</button>}
      <form key={String(editingApplication?.id ?? "new-application")} onSubmit={saveApplication} className="grid gap-3 sm:grid-cols-2">
        {canSetFarmer && !editingApplication && <label className="field-label">Farmer<select className="field-control" value={selectedFarmer} onChange={(event) => setSelectedFarmer(event.target.value)} required><option value="">Select farmer…</option>{farmers.map((farmer) => <option key={String(farmer.id)} value={String(farmer.id)}>{label(farmer.full_name ?? farmer.first_name ?? farmer.id)} · {label(farmer.farmer_number)}</option>)}</select></label>}
        <label className="field-label">Farm<select className="field-control" name="farm" required defaultValue={String(editingApplication?.farm ?? "")}><option value="">Select farm…</option>{availableFarms.map((farm) => <option key={String(farm.id)} value={String(farm.id)}>{label(farm.name)}</option>)}</select></label>
        <label className="field-label">Financing product<select className="field-control" name="financing_product" required defaultValue={String(editingApplication?.financing_product ?? "")}><option value="">Select product…</option>{products.filter((product) => product.active).map((product) => <option key={String(product.id)} value={String(product.id)}>{label(product.name)} · {label(product.currency)}</option>)}</select></label>
        <label className="field-label">Requested amount<input className="field-control" name="requested_amount" type="number" required min="0.01" step="0.01" defaultValue={String(editingApplication?.requested_amount ?? "")} /></label>
        <label className="field-label">Asset or service<input className="field-control" name="requested_asset_or_service" defaultValue={String(editingApplication?.requested_asset_or_service ?? "")} /></label>
        <label className="field-label sm:col-span-2">Purpose<textarea className="field-control min-h-20 py-2" name="purpose" required defaultValue={String(editingApplication?.purpose ?? "")} /></label>
        <div className="sm:col-span-2"><button disabled={busy !== ""} className="primary-button">{busy === "application-save" ? "Saving…" : editingApplication ? "Save draft" : "Save application draft"}</button></div>
      </form>
    </Panel>}

    <Panel title="Financing applications">
      {applications.length === 0 ? <p className="text-xs text-[var(--muted)]">No financing applications are available to your account.</p> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Reference</th><th>Farmer</th><th>Product</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
        {applications.map((application) => { const id = String(application.id); const status = String(application.status); return <tr key={id}><td className="mono text-[11px]">{label(application.application_reference)}</td><td>{label(application.farmer_name)}</td><td>{label(application.product_name)}</td><td>{label(application.requested_amount)} {label(products.find((item) => String(item.id) === String(application.financing_product))?.currency)}</td><td><span className="status-pill status-wait">{status.replaceAll("_", " ")}</span></td><td className="text-right"><button className="font-semibold text-[var(--leaf)]" onClick={() => setSelected(application)}>Details</button></td></tr>; })}
      </tbody></table></div>}
    </Panel>

    {selected && <Panel title={`Application ${label(selected.application_reference)}`}>
      <div className="grid gap-2 text-xs sm:grid-cols-2"><p><b>Farmer:</b> {label(selected.farmer_name)}</p><p><b>Farm:</b> {label(selected.farm_name)}</p><p><b>Amount:</b> {label(selected.requested_amount)}</p><p><b>Status:</b> {label(selected.status)}</p><p className="sm:col-span-2"><b>Purpose:</b> {label(selected.purpose)}</p></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {String(selected.status) === "DRAFT" || String(selected.status) === "RETURNED" ? permitted(session, "financing_application.update") && <button className="secondary-button" onClick={() => setEditingApplication(selected)}>Edit draft</button> : null}
        {["DRAFT", "RETURNED"].includes(String(selected.status)) && permitted(session, "financing_application.submit") && <button className="primary-button" disabled={busy !== ""} onClick={() => void mutate("application-submit", `financing/applications/${String(selected.id)}/submit`, "POST", {})}>Submit for assessment</button>}
        {String(selected.status) === "ASSESSED" && permitted(session, "financing_application.approve") && <button className="primary-button" disabled={busy !== ""} onClick={() => void mutate("application-approve", `financing/applications/${String(selected.id)}/approve`, "POST", {})}>Approve</button>}
        {["SUBMITTED", "ASSESSED"].includes(String(selected.status)) && permitted(session, "financing_application.reject") && <button className="danger-button" disabled={busy !== ""} onClick={() => { const reason = window.prompt("Reason for rejection"); if (reason?.trim()) void mutate("application-reject", `financing/applications/${String(selected.id)}/reject`, "POST", { reason }); }}>Reject</button>}
        <button className="secondary-button" onClick={() => setSelected(null)}>Close</button>
      </div>
      {canCreateAssessment && String(selected.status) === "SUBMITTED" && <form onSubmit={assess} className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2"><h3 className="text-xs font-semibold sm:col-span-2">Record assessment</h3><label className="field-label">Risk rating<input className="field-control" name="risk_rating" placeholder="LOW / MEDIUM / HIGH" /></label><label className="field-label">Recommendation<input className="field-control" name="recommendation" /></label><label className="field-label sm:col-span-2">Assessment notes<textarea className="field-control min-h-16 py-2" name="notes" /></label><div className="sm:col-span-2"><button disabled={busy !== ""} className="primary-button">Submit assessment</button></div></form>}
      {canReadAssessments && <div className="mt-5 border-t border-[var(--line)] pt-4"><h3 className="text-xs font-semibold">Assessments</h3>{assessments.map((item) => <p key={String(item.id)} className="mt-2 text-xs">{label(item.recommendation)} <span className="text-[var(--muted)]">· {label(item.assessor_name)} · {label(item.assessed_at)}</span></p>)}</div>}
      {canCreateTransaction && String(selected.status) === "APPROVED" && <form onSubmit={createTransaction} className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-3"><h3 className="text-xs font-semibold sm:col-span-3">Record financing transaction</h3><label className="field-label">Type<select className="field-control" name="transaction_type"><option value="DISBURSEMENT">Disbursement</option><option value="REPAYMENT">Repayment</option></select></label><label className="field-label">Amount<input className="field-control" name="amount" type="number" min="0.01" step="0.01" required /></label><label className="field-label">Currency<input className="field-control" name="currency" defaultValue="NGN" maxLength={8} required /></label><div className="sm:col-span-3"><button disabled={busy !== ""} className="primary-button">Record pending transaction</button></div></form>}
      {canReadTransactions && <div className="mt-5 border-t border-[var(--line)] pt-4"><h3 className="text-xs font-semibold">Transactions</h3>{transactions.length === 0 ? <p className="mt-2 text-xs text-[var(--muted)]">No financing transactions recorded.</p> : transactions.map((item) => <div key={String(item.id)} className="mt-3 rounded-lg border border-[var(--line)] p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span>{label(item.transaction_type)} · {label(item.amount)} {label(item.currency)}</span><span className="status-pill status-wait">{label(item.status)}</span></div>{canExecuteTransaction && String(item.status) === "PENDING" && <form onSubmit={(event) => void executeTransaction(event, String(item.id))} className="mt-3 flex flex-wrap gap-2"><input className="field-control min-w-[240px] flex-1" name="financial_transaction" placeholder="Successful financial transaction UUID" required /><button className="secondary-button" disabled={busy !== ""}>Link and execute</button></form>}{(transactionHistories[String(item.id)] ?? []).map((entry) => <p key={String(entry.id)} className="mt-2 text-[10px] text-[var(--muted)]">{label(entry.old_status) || "Created"} → {label(entry.new_status)} · {label(entry.changed_by_name)} · {label(entry.created_at)}</p>)}</div>)}</div>}
      <div className="mt-5 border-t border-[var(--line)] pt-4"><h3 className="text-xs font-semibold">Status history</h3>{history.map((item) => <p key={String(item.id)} className="mt-2 text-xs">{label(item.old_status) || "Created"} → {label(item.new_status)} <span className="text-[var(--muted)]">· {label(item.changed_by_name)} · {label(item.created_at)}</span></p>)}</div>
    </Panel>}

    {canCreateApplication && !canSetFarmer && <p className="text-xs text-[var(--muted)]">Applications are restricted to your own farms. Ask a field officer or administrator for assistance if your farm is missing.</p>}
  </>;
}
