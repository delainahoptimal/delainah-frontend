import { createUuid } from "@/lib/uuid";

export type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
};

export class ApiError extends Error {
  status: number;
  requestId: string | null;
  payload: unknown;

  constructor(message: string, status: number, requestId: string | null, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.payload = payload;
  }
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const body = error.payload as Record<string, unknown> | null;
    if (body?.detail || body?.message) return String(body.detail ?? body.message);
    if (body) {
      const fields = Object.entries(body)
        .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.map(String).join(" ") : String(value)}`)
        .join(" · ");
      if (fields) return fields;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const [pathPart, queryPart] = path.split("?", 2);
  const cleanPath = pathPart.replace(/^\/+|\/+$/g, "");
  const headers = new Headers(options.headers);
  const requestId = createUuid();
  headers.set("X-Request-ID", requestId);
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const target = `/api/backend/${cleanPath}/${queryPart ? `?${queryPart}` : ""}`;
  const response = await fetch(target, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
    credentials: "same-origin",
    cache: "no-store",
  });

  const contentType = response.headers.get("Content-Type") ?? "";
  const payload = response.status === 204 ? null : contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : `Request failed (${response.status}).`;
    throw new ApiError(detail, response.status, response.headers.get("X-Request-ID"), payload);
  }
  return payload as T;
}

export function pageQuery(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim() !== "") query.set(key, String(value));
  }
  return query.size ? `?${query.toString()}` : "";
}

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type SessionUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  user_type?: string;
  is_active?: boolean;
  is_verified?: boolean;
  is_email_verified?: boolean;
  created_at?: string;
};
export type RoleGrant = { id?: string; code: string; name?: string; scopes?: string[]; is_active?: boolean };
export type PermissionEntry = { id?: string; code: string; description?: string };