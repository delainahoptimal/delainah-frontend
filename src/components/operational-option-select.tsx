"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, errorMessage } from "@/lib/api";

type Option = { id: string; value: string };

export default function OperationalOptionSelect({
  kind,
  label,
  name,
  required = false,
  defaultValue,
  isSuperAdmin = false,
}: {
  kind: string;
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  isSuperAdmin?: boolean;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<Option[]>(`operational-options?kind=${encodeURIComponent(kind)}`)
      .then((result) => { if (active) setOptions(result); })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, retry]);

  const hasSavedOption = Boolean(defaultValue && options.some((option) => option.value === defaultValue));
  return <label className="field-label">{label}
    <select className="field-control" name={name} defaultValue={defaultValue ?? ""} required={required} disabled={loading || Boolean(error) || (options.length === 0 && !defaultValue)}>
      <option value="">{loading ? "Loading options…" : `Select ${label.toLowerCase()}…`}</option>
      {defaultValue && !hasSavedOption && <option value={defaultValue}>{defaultValue} (existing value)</option>}
      {options.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
    </select>
    {error ? <span className="field-hint">Could not load choices: {errorMessage(error)} <button type="button" className="font-semibold underline" onClick={() => { setLoading(true); setError(null); setRetry((current) => current + 1); }}>Retry</button></span> : !loading && options.length === 0 ? <span className="field-hint">No choices are available yet.{isSuperAdmin && <> <Link className="font-semibold underline" href="/operations/catalogues">Create choices</Link></>}</span> : null}
  </label>;
}
