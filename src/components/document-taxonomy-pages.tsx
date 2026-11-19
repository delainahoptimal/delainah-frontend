"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiRequest, errorMessage } from "@/lib/api";
import type { RoleGrant, SessionUser } from "@/lib/api";

type Row = Record<string, unknown>;
type SessionInfo = { user: SessionUser; roles: RoleGrant[]; permissions: string[]; permissionError?: boolean };

function permitted(session: SessionInfo, code: string) {
  return !session.permissionError && session.permissions.includes(code);
}

export default function DocumentTaxonomyPages({ session }: { session: SessionInfo }) {
  const [categories, setCategories] = useState<Row[]>([]);
  const [tags, setTags] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      permitted(session, "document_category.read") ? apiRequest<Row[]>("document-categories") : Promise.resolve([]),
      permitted(session, "document_tag.read") ? apiRequest<Row[]>("document-tags") : Promise.resolve([]),
    ]).then(([categoryRows, tagRows]) => {
      if (active) { setCategories(categoryRows); setTags(tagRows); }
    }).catch((reason) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [refresh, session]);

  async function create(kind: "category" | "tag", event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const key = kind === "category" ? "category" : "tag";
    setBusy(key); setError(null);
    try {
      await apiRequest(kind === "category" ? "document-categories" : "document-tags", { method: "POST", body: { name: String(values.name) } });
      form.reset(); setRefresh((value) => value + 1);
    } catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }

  async function deactivate(kind: "category" | "tag", id: string) {
    setBusy(`${kind}-${id}`); setError(null);
    try {
      await apiRequest(`${kind === "category" ? "document-categories" : "document-tags"}/${id}/deactivate`, { method: "POST", body: {} });
      setRefresh((value) => value + 1);
    } catch (reason) { setError(reason); }
    finally { setBusy(""); }
  }

  const categoryCreate = permitted(session, "document_category.create");
  const tagCreate = permitted(session, "document_tag.create");
  const categoryDeactivate = permitted(session, "document_category.deactivate");
  const tagDeactivate = permitted(session, "document_tag.deactivate");

  return <>
    <div className="mb-7"><div className="eyebrow">Verification / Taxonomy</div><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.02em] sm:text-[30px]">Document taxonomy</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Create and deactivate document categories and tags used to classify documents and KYC evidence.</p></div>
    {error && <div role="alert" className="mb-5 rounded-lg border border-[#efc9c0] bg-[#fff6f3] px-4 py-3 text-xs text-[#964d3e]">{errorMessage(error)} <button className="ml-2 font-semibold" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="surface-panel p-5 sm:p-6"><h2 className="text-sm font-semibold">Document categories</h2>{categoryCreate && <form onSubmit={(event) => void create("category", event)} className="mt-4 flex gap-2"><input className="field-control flex-1" name="name" required placeholder="Category name" /><button className="primary-button" disabled={busy !== ""}>Create</button></form>}<div className="mt-4 divide-y divide-[var(--line)]">{categories.map((item) => <div key={String(item.id)} className="flex items-center justify-between gap-3 py-3 text-xs"><span>{String(item.name)} · {item.active ? "Active" : "Inactive"}</span>{categoryDeactivate && Boolean(item.active) && <button className="danger-button !min-h-8" disabled={busy !== ""} onClick={() => void deactivate("category", String(item.id))}>Deactivate</button>}</div>)}</div></section>
      <section className="surface-panel p-5 sm:p-6"><h2 className="text-sm font-semibold">Document tags</h2>{tagCreate && <form onSubmit={(event) => void create("tag", event)} className="mt-4 flex gap-2"><input className="field-control flex-1" name="name" required placeholder="Tag name" /><button className="primary-button" disabled={busy !== ""}>Create</button></form>}<div className="mt-4 divide-y divide-[var(--line)]">{tags.map((item) => <div key={String(item.id)} className="flex items-center justify-between gap-3 py-3 text-xs"><span>{String(item.name)} · {item.active ? "Active" : "Inactive"}</span>{tagDeactivate && Boolean(item.active) && <button className="danger-button !min-h-8" disabled={busy !== ""} onClick={() => void deactivate("tag", String(item.id))}>Deactivate</button>}</div>)}</div></section>
    </div>
  </>;
}
