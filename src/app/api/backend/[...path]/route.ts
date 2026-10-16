import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const ACCESS_COOKIE = "delainah_access";
const REFRESH_COOKIE = "delainah_refresh";
const API_BASE_URL = (process.env.API_BASE_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/+$/, "");

type RouteContext = { params: Promise<{ path: string[] }> };
type ProxyMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function backendUrl(path: string, search: string) {
  return `${API_BASE_URL}/${path.split("/").map(encodeURIComponent).join("/")}/${search ? `?${search}` : ""}`;
}

function responseHeaders(requestId: string, contentType: string | null) {
  const headers = new Headers({ "X-Request-ID": requestId });
  if (contentType) headers.set("Content-Type", contentType);
  return headers;
}

function jsonError(message: string, requestId: string, status = 502) {
  return Response.json({ detail: message }, { status, headers: responseHeaders(requestId, "application/json") });
}

async function refreshTokens(refresh: string, requestId: string) {
  const response = await fetch(backendUrl("auth/refresh-token", ""), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as { access?: string; refresh?: string };
}

async function proxy(request: NextRequest, context: RouteContext, method: ProxyMethod) {
  const { path } = await context.params;
  const apiPath = path.join("/");
  const requestId = request.headers.get("X-Request-ID") || crypto.randomUUID();
  const store = await cookies();
  const isLogin = apiPath === "auth/login" && method === "POST";
  const isLogout = apiPath === "auth/logout" && method === "POST";
  let payload = method === "GET" || method === "DELETE" ? new Uint8Array() : new Uint8Array(await request.arrayBuffer());

  if (isLogout) {
    payload = new TextEncoder().encode(JSON.stringify({ refresh: store.get(REFRESH_COOKIE)?.value }));
  }

  const headers = new Headers({ "X-Request-ID": requestId });
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  if (isLogout) headers.set("Content-Type", "application/json");

  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (accessToken && !isLogin) headers.set("Authorization", `Bearer ${accessToken}`);

  const send = (authHeaders: Headers) =>
    fetch(`${backendUrl(apiPath, request.nextUrl.search.slice(1))}`, {
      method,
      headers: authHeaders,
      body: payload.byteLength ? payload : undefined,
      cache: "no-store",
      redirect: "manual",
    });

  try {
    let backendResponse = await send(headers);
    let refreshed: { access?: string; refresh?: string } | null = null;

    if (backendResponse.status === 401 && refreshToken && !isLogin) {
      refreshed = await refreshTokens(refreshToken, requestId);
      if (refreshed?.access) {
        headers.set("Authorization", `Bearer ${refreshed.access}`);
        if (isLogout) {
          payload = new TextEncoder().encode(JSON.stringify({ refresh: refreshed.refresh ?? refreshToken }));
        }
        backendResponse = await send(headers);
      }
    }

    const responseBody = await backendResponse.arrayBuffer();
    const resultHeaders = responseHeaders(requestId, backendResponse.headers.get("Content-Type"));
    const backendRequestId = backendResponse.headers.get("X-Request-ID");
    if (backendRequestId) resultHeaders.set("X-Request-ID", backendRequestId);

    if (isLogin && backendResponse.ok) {
      const tokenResponse = JSON.parse(new TextDecoder().decode(responseBody)) as {
        access?: string;
        refresh?: string;
      };
      if (tokenResponse.access && tokenResponse.refresh) {
        store.set(ACCESS_COOKIE, tokenResponse.access, { ...cookieOptions, maxAge: 60 * 15 });
        store.set(REFRESH_COOKIE, tokenResponse.refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
        delete tokenResponse.access;
        delete tokenResponse.refresh;
        resultHeaders.set("Content-Type", "application/json");
        return new Response(JSON.stringify(tokenResponse), { status: backendResponse.status, headers: resultHeaders });
      }
    }

    if (refreshed?.access) {
      store.set(ACCESS_COOKIE, refreshed.access, { ...cookieOptions, maxAge: 60 * 15 });
      store.set(REFRESH_COOKIE, refreshed.refresh ?? refreshToken ?? "", {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    if (isLogout || (backendResponse.status === 401 && refreshToken && !refreshed?.access)) {
      store.delete(ACCESS_COOKIE);
      store.delete(REFRESH_COOKIE);
    }

    if (backendResponse.status === 204 || backendResponse.status === 304) {
      return new Response(null, { status: backendResponse.status, headers: resultHeaders });
    }
    return new Response(responseBody, { status: backendResponse.status, headers: resultHeaders });
  } catch {
    return jsonError("The API is unavailable. Check the backend connection and try again.", requestId);
  }
}

export const GET = (request: NextRequest, context: RouteContext) => proxy(request, context, "GET");
export const POST = (request: NextRequest, context: RouteContext) => proxy(request, context, "POST");
export const PATCH = (request: NextRequest, context: RouteContext) => proxy(request, context, "PATCH");
export const PUT = (request: NextRequest, context: RouteContext) => proxy(request, context, "PUT");
export const DELETE = (request: NextRequest, context: RouteContext) => proxy(request, context, "DELETE");