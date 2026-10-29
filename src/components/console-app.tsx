"use client";

import Image from "next/image";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  ShoppingBasket,
  ShieldCheck,
  Tractor,
  Users,
  UserRound,
  Wheat,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, InputHTMLAttributes, Ref } from "react";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import type { PermissionEntry, RoleGrant, SessionUser } from "@/lib/api";
import WorkflowPages from "@/components/workflow-pages";

type Session = { user: SessionUser; roles: RoleGrant[]; permissions: string[]; permissionError: boolean };

const navItems = [
  { group: "Workspace", label: "Overview", href: "/overview", icon: LayoutDashboard, any: ["farmer.read", "field_visit.read", "auth.read"] },
  { group: "Workspace", label: "My profile", href: "/account/profile", icon: UserRound, any: ["auth.return"] },
  { group: "People & farms", label: "Farmer registry", href: "/farmers", icon: Users, any: ["farmer.read"] },
  { group: "People & farms", label: "Farms", href: "/farms", icon: MapIcon, any: ["farm.read"] },
  { group: "People & farms", label: "Crop records", href: "/farm-crops", icon: MapIcon, any: ["farm_crop.read"] },
  { group: "People & farms", label: "Crop activities", href: "/crop-activities", icon: ClipboardList, any: ["farm_crop.read"] },
  { group: "People & farms", label: "Crop catalogue", href: "/crops", icon: FileText, any: ["crop.read"] },
  { group: "People & farms", label: "Seasons", href: "/seasons", icon: Activity, any: ["season.read"] },
  { group: "Field operations", label: "Field visits", href: "/field-visits", icon: ClipboardList, any: ["field_visit.read"] },
  { group: "Field operations", label: "Field reports", href: "/field-reports", icon: FileCheck2, any: ["field_report.read"] },
  { group: "Field operations", label: "Offline sync", href: "/offline-sync", icon: Activity, any: ["service_request.create", "field_report.create"] },
  { group: "Farm operations", label: "Operations overview", href: "/operations", icon: LayoutDashboard, any: ["service_request.read", "service_request.create", "machinery.read", "machinery.create", "produce.read", "produce.create", "procurement.read", "procurement.create"] },
  { group: "Farm operations", label: "Service requests", href: "/service-requests", icon: ClipboardList, any: ["service_request.read", "service_request.create"] },
  { group: "Farm operations", label: "Machinery", href: "/machinery", icon: Tractor, any: ["machinery.read", "machinery.create"] },
  { group: "Farm operations", label: "Produce listings", href: "/produce", icon: Wheat, any: ["produce.read", "produce.create"] },
  { group: "Farm operations", label: "Procurement", href: "/procurement", icon: ShoppingBasket, any: ["procurement.read", "procurement.create"] },
  { group: "Verification", label: "KYC review", href: "/kyc", icon: BadgeCheck, any: ["kyc.read", "kyc.create"] },
  { group: "Verification", label: "Documents", href: "/documents", icon: FileText, any: ["document.read", "document_type.read"] },
  { group: "Verification", label: "Document types", href: "/document-types", icon: FileCheck2, any: ["document_type.read"] },
  { group: "Field team", label: "Field officers", href: "/field-officers", icon: Users, any: ["field_officer.read"] },
  { group: "Field team", label: "Assignments", href: "/assignments", icon: ClipboardList, any: ["assignment.manage"] },
  { group: "Administration", label: "Users", href: "/admin/users", icon: Users, any: ["user.read"] },
  { group: "Administration", label: "Roles & scopes", href: "/admin/roles", icon: ShieldCheck, any: ["user.read"] },
  { group: "Administration", label: "Permissions", href: "/admin/permissions", icon: Activity, any: ["permission.manage", "user.read"] },
  { group: "Administration", label: "Archive approvals", href: "/admin/archivals", icon: FileCheck2, any: ["farmer.delete_approve"] },
  { group: "Administration", label: "Audit search", href: "/audit", icon: Activity, any: ["audit.read"] },
  { group: "Administration", label: "Support", href: "/support", icon: ClipboardList, any: ["support_ticket.read"] },
];

const publicRoutes = new Set(["/login", "/register", "/verify", "/verify-email", "/forgot-password"]);

function permissionCodes(payload: PermissionEntry[] | { permissions?: string[] | PermissionEntry[]; results?: PermissionEntry[] }) {
  const values = Array.isArray(payload) ? payload : payload.permissions ?? payload.results ?? [];
  return values.map((entry) => typeof entry === "string" ? entry : entry.code).filter(Boolean);
}

async function loadSession(): Promise<Session> {
  const user = await apiRequest<SessionUser>("auth/me");
  const [rolesResult, permissionsResult] = await Promise.allSettled([
    apiRequest<RoleGrant[] | { results?: RoleGrant[] }>("auth/me/roles"),
    apiRequest<PermissionEntry[] | { permissions?: string[] | PermissionEntry[]; results?: PermissionEntry[] }>("auth/me/permissions"),
  ]);
  const rolesPayload = rolesResult.status === "fulfilled" ? rolesResult.value : [];
  const roles = Array.isArray(rolesPayload) ? rolesPayload : rolesPayload.results ?? [];
  const permissions = permissionsResult.status === "fulfilled" ? permissionCodes(permissionsResult.value) : [];
  return { user, roles, permissions, permissionError: permissionsResult.status === "rejected" };
}

export default function ConsoleApp() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [verificationContacts, setVerificationContacts] = useState({ email: "", phone: "", userType: "" });
  const postLoginPath = useRef("");
  const loggingOut = useRef(false);
  const sessionGeneration = useRef(0);
  const isPublicRoute = publicRoutes.has(pathname);

  async function refreshSession() {
    const generation = ++sessionGeneration.current;
    setLoading(true);
    setSessionError("");
    try {
      const nextSession = await loadSession();
      if (generation !== sessionGeneration.current) return false;
      setSession(nextSession);
      return true;
    } catch (error) {
      if (generation === sessionGeneration.current) {
        setSession(null);
        setSessionError(errorMessage(error));
      }
      return false;
    } finally {
      if (generation === sessionGeneration.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (isPublicRoute || session || loggingOut.current) return;
    let active = true;
    const generation = sessionGeneration.current;
    loadSession()
      .then((value) => { if (active && generation === sessionGeneration.current) setSession(value); })
      .catch((error: unknown) => { if (active && generation === sessionGeneration.current) setSessionError(errorMessage(error)); })
      .finally(() => { if (active && generation === sessionGeneration.current) setLoading(false); });
    return () => { active = false; };
  }, [isPublicRoute, session]);

  useEffect(() => {
    if (session && (pathname === "/" || pathname === "/login") && !postLoginPath.current && !loggingOut.current) router.replace("/overview");
    if (!loading && !session && !isPublicRoute && pathname !== "/") router.replace("/login");
  }, [isPublicRoute, loading, pathname, postLoginPath, router, session]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const availableNav = useMemo(() => {
    if (!session) return [];
    const farmerHiddenRoutes = new Set(["/farmers", "/crops", "/seasons", "/document-types"]);
    return navItems.filter((item) => item.any.some((permission) => session.permissions.includes(permission)) && !(session.user.user_type === "FARMER" && farmerHiddenRoutes.has(item.href)));
  }, [session]);
  const navGroups = useMemo(() => {
    const groups = new Map<string, typeof availableNav>();
    for (const item of availableNav) {
      const entries = groups.get(item.group) ?? [];
      entries.push(item);
      groups.set(item.group, entries);
    }
    return [...groups.entries()];
  }, [availableNav]);

  async function onLogin(identifier: string, password: string) {
    try {
      await apiRequest("auth/login", {
        method: "POST",
        body: identifier.includes("@") ? { email: identifier, password } : { phone_number: identifier, password },
      });
    } catch (reason) {
      if (reason instanceof ApiError && reason.payload && typeof reason.payload === "object") {
        const payload = reason.payload as Record<string, unknown>;
        const fieldValue = (value: unknown) => Array.isArray(value) ? value[0] : value;
        const verificationRequired = String(fieldValue(payload.verification_required)).toLowerCase() === "true";
        if (verificationRequired) {
          setVerificationContacts({
            email: String(fieldValue(payload.email) ?? ""),
            phone: String(fieldValue(payload.phone_number) ?? ""),
            userType: String(fieldValue(payload.user_type) ?? ""),
          });
          router.push("/verify");
          return;
        }
      }
      throw reason;
    }
    if (!await refreshSession()) throw new Error("Sign-in succeeded, but the session could not be verified. Please try again.");
    loggingOut.current = false;
    const destination = postLoginPath.current || "/overview";
    postLoginPath.current = "";
    router.replace(destination);
  }

  async function onLogout() {
    if (loggingOut.current) return;
    loggingOut.current = true;
    sessionGeneration.current += 1;
    try { await apiRequest("auth/logout", { method: "POST", body: {} }); }
    catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setToast("Signed out locally; the server could not revoke this session.");
    } finally {
      setSession(null);
      setLoading(false);
      window.location.replace("/");
    }
  }

  if (isPublicRoute || (!session && !loading && pathname === "/login")) {
    return <AuthScreen key={isPublicRoute ? pathname : "/login"} path={isPublicRoute ? pathname : "/login"} onLogin={onLogin} verificationContacts={verificationContacts} onRegistered={(email, phone, userType) => { setVerificationContacts({ email, phone, userType }); router.push("/verify"); }} onContinueToKyc={() => { postLoginPath.current = "/kyc/new"; router.push("/login"); }} />;
  }

  if (!session || loading) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--leaf)]" />
          {sessionError ? "Checking your session" : "Preparing your workspace"}
        </div>
      </main>
    );
  }

  const displayName = [session.user.first_name, session.user.last_name].filter(Boolean).join(" ") || session.user.email;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[258px_minmax(0,1fr)]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col bg-[var(--forest)] text-white transition-transform lg:static lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[76px] items-center justify-between border-b border-white/10 px-6">
          <Link href="/overview" className="flex items-center gap-3" onClick={() => setMobileNavOpen(false)}>
            <Image src="/de-lainah-logo.png" alt="Delainah logo" width={36} height={36} className="h-9 w-9 rounded-xl bg-white object-contain p-1.5" />
            <span><span className="block text-sm font-bold tracking-wide">Delainah</span><span className="block text-[10px] uppercase tracking-[0.12em] text-white/55">Agriculture platform</span></span>
          </Link>
          <button className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <nav aria-label="Main navigation" className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 pb-5 pt-5">
          {navGroups.map(([group, items]) => <section key={group} aria-label={group}>
            <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{group}</h2>
            <div className="space-y-1">{items.map((item, index) => {
              const active = pathname === item.href || (item.href !== "/overview" && pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors ${active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/[0.07] hover:text-white"}`} style={{ animationDelay: `${index * 24}ms` }}><Icon size={16} strokeWidth={active ? 2.3 : 1.8} className={active ? "text-[var(--lime)]" : "text-white/55 group-hover:text-white/80"} /><span className="flex-1">{item.label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />}</Link>;
            })}</div>
          </section>)}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3 rounded-xl bg-black/10 p-3">
            <Link href="/account/profile" onClick={() => setMobileNavOpen(false)} aria-label="My profile" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d5e8d8] text-xs font-bold text-[var(--forest)]">{displayName.slice(0, 1).toUpperCase()}</Link>
            <div className="min-w-0 flex-1"><Link href="/account/profile" onClick={() => setMobileNavOpen(false)} className="block truncate text-xs font-semibold hover:text-[var(--lime)]">{displayName}</Link><div className="mt-0.5 truncate text-[10px] text-white/50">{session.roles.map((role) => role.name || role.code).join(" · ") || session.user.user_type || "Account"}</div></div>
            <Link href="/account/password" title="Change password" aria-label="Change password" className="grid h-8 w-8 place-items-center rounded-md text-white/55 hover:bg-white/10 hover:text-white"><KeyRound size={15} /></Link>
            <button onClick={onLogout} title="Sign out" aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-md text-white/55 hover:bg-white/10 hover:text-white"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
      {mobileNavOpen && <button className="fixed inset-0 z-30 bg-black/35 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[var(--line)] bg-[rgba(255,255,255,0.92)] px-4 backdrop-blur-md sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink)] lg:hidden" aria-label="Open navigation"><Menu size={18} /></button>
            <div className="flex items-center gap-2"><Image src="/de-lainah-logo.png" alt="Delainah logo" width={20} height={20} className="h-5 w-5 rounded object-contain" /><div><div className="text-[11px] text-[var(--muted)]">Delainah / {navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "Workspace"}</div><div className="mt-0.5 text-sm font-semibold">{new Intl.DateTimeFormat("en-NG", { dateStyle: "full" }).format(new Date())}</div></div></div>
          </div>
          <div className="flex items-center gap-3"><button onClick={() => void refreshSession()} title="Refresh permissions" aria-label="Refresh session" className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-white"><Activity size={16} /></button></div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-7 sm:px-7 lg:px-9 lg:pt-9">
          {session.permissionError && <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-[#edcf9e] bg-[#fff8e8] px-4 py-3 text-xs text-[#7d5b20]">Permission bootstrap failed. Protected actions are hidden until it is retried.<button className="flex shrink-0 items-center gap-1 font-semibold" onClick={() => void refreshSession()}>Retry <ArrowRight size={13} /></button></div>}
          <WorkflowPages path={pathname} session={session} onToast={setToast} onSessionRefresh={async () => { await refreshSession(); }} />
        </main>
      </div>
      {toast && <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-40px)] items-start gap-3 rounded-xl bg-[var(--forest)] px-4 py-3 text-sm text-white shadow-xl"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--lime)]" />{toast}</div>}
    </div>
  );
}

function AuthScreen({ path, onLogin, verificationContacts, onRegistered, onContinueToKyc }: { path: string; onLogin: (identifier: string, password: string) => Promise<void>; verificationContacts: { email: string; phone: string; userType: string }; onRegistered: (email: string, phone: string, userType: string) => void; onContinueToKyc: () => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [completeMessage, setCompleteMessage] = useState("");
  const [verificationChannel, setVerificationChannel] = useState<"email" | "phone">(path === "/verify-email" ? "email" : "phone");
  const [verificationEmail, setVerificationEmail] = useState(verificationContacts.email);
  const [verificationPhone, setVerificationPhone] = useState(verificationContacts.phone);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      if (path === "/login") {
        await onLogin(String(form.get("identifier")), String(form.get("password")));
      } else if (path === "/register") {
        const userType = String(form.get("user_type"));
        const email = String(form.get("email"));
        const phone = String(form.get("phone_number"));
        await apiRequest(`auth/register/${userType.toLowerCase()}`, { method: "POST", body: Object.fromEntries(["email", "password", "first_name", "last_name", "phone_number"].map((key) => [key, form.get(key)])) });
        onRegistered(email, phone, userType.toUpperCase());
      } else if (path === "/verify" || path === "/verify-email") {
        const channel = verificationChannel;
        const contact = String(form.get(channel === "email" ? "email" : "phone_number") ?? "");
        const body = channel === "email" ? { email: contact, code: form.get("code") } : { phone_number: contact, code: form.get("code") };
        await apiRequest(channel === "email" ? "auth/email/verify" : "auth/verify-account", { method: "POST", body });
        setComplete(true);
        setCompleteMessage(channel === "email" ? "Email address verified." : "Phone number verified.");
      } else if (path === "/forgot-password") {
        if (form.get("code")) {
          await apiRequest("auth/reset-password", { method: "POST", body: { email: form.get("email") || undefined, phone_number: form.get("phone_number") || undefined, code: form.get("code"), new_password: form.get("new_password") } });
          setComplete(true);
          setCompleteMessage("Password reset. You can now sign in with your new password.");
        } else {
          const email = String(form.get("email") || "");
          const phone = String(form.get("phone_number") || "");
          const response = await apiRequest<{ detail?: string }>("auth/forgot-password", { method: "POST", body: email ? { email } : { phone_number: phone } });
          setSubmitted(true);
          setNotice(response.detail ?? "If an account matches, password reset instructions have been sent.");
        }
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerificationCode() {
    const channel = verificationChannel;
    const contact = channel === "email" ? verificationEmail : verificationPhone;
    if (!contact.trim()) { setError(`Enter your ${channel === "email" ? "email address" : "phone number"} first.`); return; }
    try {
      const result = channel === "email"
        ? await apiRequest<{ detail?: string }>("auth/email/request-verification", { method: "POST", body: { email: contact } })
        : await apiRequest<{ detail?: string }>("auth/resend-verification", { method: "POST", body: { phone_number: contact } });
      setNotice(result.detail ?? "A new verification code has been requested.");
      setError("");
    } catch (reason) { setError(errorMessage(reason)); }
  }

  const isVerificationPath = path === "/verify" || path === "/verify-email";
  const title = path === "/register" ? "Create your account" : isVerificationPath ? "Verify your account" : path === "/forgot-password" ? "Reset your password" : "Welcome back";
  if (complete) {
    const completionTitle = isVerificationPath ? verificationChannel === "email" ? "Email verified" : "Phone verified" : path === "/forgot-password" ? "Password updated" : "Account created";
    const canContinueToKyc = isVerificationPath && ["FARMER", "INVESTOR"].includes(verificationContacts.userType);
    return <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5"><div className="w-full max-w-md rounded-xl border border-[var(--line)] bg-white p-7 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#e2f1e4] text-[var(--leaf)]"><BadgeCheck size={21} /></span><h2 className="mt-5 text-xl font-semibold">{completionTitle}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{completeMessage}</p><div className="mt-6 flex flex-col gap-3">{canContinueToKyc && <button onClick={onContinueToKyc} className="primary-button justify-center">Sign in and continue to KYC <ArrowRight size={15} /></button>}<button onClick={() => router.push("/login")} className={canContinueToKyc ? "secondary-button justify-center" : "primary-button justify-center"}>{canContinueToKyc ? "Skip KYC and sign in" : "Go to sign in"}</button></div></div></main>;
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(370px,0.88fr)_1.12fr]">
      <section className="relative hidden overflow-hidden bg-[var(--forest)] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute -right-20 top-24 h-72 w-72 rounded-full border border-white/10" /><div className="absolute -right-4 top-40 h-40 w-40 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3"><Image src="/de-lainah-logo.png" alt="Delainah logo" width={40} height={40} className="h-10 w-10 rounded-xl bg-white object-contain p-1.5" /><span className="text-sm font-bold tracking-[0.08em]">Delainah</span></div>
        <div className="relative max-w-md pb-8"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/75"><span className="h-1.5 w-1.5 rounded-full bg-[var(--lime)]" /> Agriculture, connected</div><h1 className="text-[42px] font-semibold leading-[1.08] tracking-[-0.02em]">A clearer view of every farm.</h1><p className="mt-5 max-w-sm text-[15px] leading-7 text-white/65">One trusted workspace for agriculture accounts, farms, and field operations.</p></div>
        <div className="relative flex items-center justify-between border-t border-white/15 pt-5 text-[10px] text-white/45"><span>Delainah Agriculture Platform</span><span className="mono">OPS / 01</span></div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px] app-enter">
          <div className="mb-9 flex items-center gap-3 lg:hidden"><Image src="/de-lainah-logo.png" alt="Delainah logo" width={36} height={36} className="h-9 w-9 rounded-xl bg-white object-contain p-1.5" /><span className="text-sm font-bold tracking-wide">Delainah</span></div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--leaf)]">Agriculture platform</div><h2 className="mt-2 text-[30px] font-semibold tracking-[-0.02em]">{title}</h2><p className="mt-2 text-sm text-[var(--muted)]">{path === "/login" ? "Sign in to continue to your workspace." : "Use the details associated with your account."}</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {path === "/login" && <><Input label="Email or phone number" name="identifier" autoComplete="username" required placeholder="name@example.com or +234…" /><Input label="Password" name="password" type="password" autoComplete="current-password" required /></>}
            {path === "/register" && <><label className="field-label">Account type<select className="field-control" name="user_type"><option value="farmer">Farmer</option><option value="investor">Investor</option></select></label><div className="grid grid-cols-2 gap-3"><Input label="First name" name="first_name" required /><Input label="Last name" name="last_name" required /></div><Input label="Email" name="email" type="email" required /><Input label="Phone number" name="phone_number" type="tel" required placeholder="+234…" /><Input label="Password" name="password" type="password" required minLength={8} /></>}
            {isVerificationPath && <><fieldset className="field-label"><legend>Send code to</legend><div className="mt-2 grid grid-cols-2 gap-2">{(["phone", "email"] as const).map((channel) => <button key={channel} type="button" aria-pressed={verificationChannel === channel} onClick={() => { setVerificationChannel(channel); setNotice(""); setError(""); }} className={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${verificationChannel === channel ? "border-[var(--forest)] bg-[var(--forest)] text-white" : "border-[var(--line)] bg-white text-[var(--ink)]"}`}>{channel === "phone" ? "Phone" : "Email"}</button>)}</div></fieldset>{verificationChannel === "email" ? <label className="field-label">Email<input className="field-control" name="email" type="email" autoComplete="email" required value={verificationEmail} onChange={(event) => setVerificationEmail(event.target.value)} /></label> : <label className="field-label">Phone number<input className="field-control" name="phone_number" type="tel" autoComplete="tel" required value={verificationPhone} onChange={(event) => setVerificationPhone(event.target.value)} /></label>}<Input label="6-digit verification code" name="code" inputMode="numeric" required maxLength={6} /><button type="button" className="text-xs font-semibold text-[var(--leaf)]" onClick={() => void resendVerificationCode()}>Resend code</button></>}
            {path === "/forgot-password" && <><Input label="Email (or use phone below)" name="email" type="email" /><Input label="Phone number" name="phone_number" type="tel" />{submitted && <><Input label="6-digit code" name="code" inputMode="numeric" required maxLength={6} /><Input label="New password" name="new_password" type="password" required minLength={8} /></>}</>}
            {notice && <div role="status" className="rounded-lg border border-[#cfe3d2] bg-[#f1f8f1] px-3 py-2.5 text-xs leading-5 text-[#38694c]">{notice}</div>}
            {error && <div role="alert" className="rounded-lg border border-[#f0c7be] bg-[#fff3f0] px-3 py-2.5 text-xs leading-5 text-[#a34e3d]">{error}</div>}
            <button disabled={busy} className="primary-button mt-2 w-full justify-center">{busy ? "Please wait…" : path === "/login" ? "Sign in" : path === "/register" ? "Create account" : isVerificationPath ? "Verify account" : submitted ? "Reset password" : "Continue"}<ArrowRight size={15} /></button>
          </form>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">{path !== "/login" && <Link className="hover:text-[var(--forest)]" href="/login">Sign in</Link>}{path === "/login" && <><Link className="hover:text-[var(--forest)]" href="/register">Create an account</Link><Link className="hover:text-[var(--forest)]" href="/forgot-password">Forgot password?</Link><Link className="hover:text-[var(--forest)]" href="/verify">Verify phone</Link><Link className="hover:text-[var(--forest)]" href="/verify-email">Verify email</Link></>}</div>
          <p className="mt-12 border-t border-[var(--line)] pt-5 text-[10px] leading-5 text-[var(--muted)]">Your account is protected by role- and scope-based access controls.</p>
        </div>
      </section>
    </main>
  );
}

function Input({ label, inputRef, ...props }: { label: string; inputRef?: Ref<HTMLInputElement> } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="field-label">{label}<input ref={inputRef} className="field-control" {...props} /></label>;
}