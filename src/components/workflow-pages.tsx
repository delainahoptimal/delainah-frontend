"use client";

import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, CircleAlert,
  Download, FilePlus2, Filter, LoaderCircle, MapPin, Plus, RefreshCw, RotateCcw, Search, ShieldAlert, Upload, X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { Page, SessionUser } from "@/lib/api";
import { apiRequest, ApiError, errorMessage, pageQuery } from "@/lib/api";
import { createUuid } from "@/lib/uuid";
import { isEncryptedOfflineQueueAvailable, readOfflineEntries, removeOfflineEntry, storeOfflineEntry } from "@/lib/offline-queue";
import type { OfflineEntry } from "@/lib/offline-queue";

type Row = Record<string, unknown>;
type SessionInfo = { user: SessionUser; permissions: string[]; roles: unknown[]; permissionError?: boolean };
type LookupKind = "farmers" | "farms" | "seasons" | "crops" | "farmCrops" | "staffUsers";
type GeographyValues = { state: string; lga: string; ward: string };
type FarmCoordinate = { latitude: number; longitude: number };
type Field = { name: string; label: string; type?: string; required?: boolean; options?: string[]; lookup?: LookupKind; dependsOn?: string; placeholder?: string; hint?: string; wide?: boolean };
type Column = { key: string; label: string; mono?: boolean; status?: boolean };
type Action = { label: string; permission: string; path: (id: string) => string; method?: "POST" | "PATCH" | "DELETE"; body?: (reason: string) => Row; reasonLabel?: string; states?: string[]; registrationSource?: string; tone?: "danger" };
type Resource = {
  title: string; eyebrow: string; endpoint: string; permission: string; columns: Column[];
  fields?: Field[]; createPermission?: string; detailHref?: string; searchHint?: string;
  statusFilter?: string[]; defaultStatus?: string; filters?: Field[]; paginated?: boolean; empty?: string;
};

const farmerStatuses = ["DRAFT", "PENDING_VERIFICATION", "VERIFIED", "ACTIVE", "SUSPENDED", "REJECTED", "RETURNED", "INACTIVE"];
const kycStatuses = ["DRAFT", "SUBMITTED", "VERIFIED", "REJECTED", "RETURNED"];
const scopeOptions = ["OWN", "ASSIGNED", "CONTEXTUAL", "OPS", "AGG", "ALL"];

const resources: Record<string, Resource> = {
  farmers: {
    title: "Farmer registry", eyebrow: "People / Farmer records", endpoint: "farmers/farmers", permission: "farmer.read", paginated: true,
    columns: [{ key: "farmer_number", label: "Farmer ID", mono: true }, { key: "first_name", label: "Name" }, { key: "email", label: "Email" }, { key: "phone_number", label: "Phone" }, { key: "state_name", label: "State" }, { key: "status", label: "Status", status: true }],
    createPermission: "farmer.create", detailHref: "/farmers", searchHint: "Name, phone, email or farmer number", statusFilter: farmerStatuses,
    filters: [{ name: "state", label: "State" }, { name: "lga", label: "LGA" }, { name: "ward", label: "Ward" }, { name: "assigned_officer", label: "Assigned officer UUID" }],
    fields: [
      { name: "email", label: "Email", type: "email", required: true }, { name: "password", label: "Initial password", type: "password", required: true },
      { name: "first_name", label: "First name", required: true }, { name: "last_name", label: "Last name", required: true },
      { name: "phone_number", label: "Phone number", type: "tel" }, { name: "date_of_birth", label: "Date of birth", type: "date" },
      { name: "gender", label: "Gender", options: ["MALE", "FEMALE"] }, { name: "state", label: "State" }, { name: "lga", label: "LGA" }, { name: "ward", label: "Ward" },
      { name: "community", label: "Community" }, { name: "address", label: "Address", type: "textarea", wide: true },
    ],
    empty: "No farmer records match these filters.",
  },
  farms: {
    title: "Farms", eyebrow: "Land / Farm records", endpoint: "farms/farms", permission: "farm.read",
    columns: [{ key: "farm_number", label: "Farm ID", mono: true }, { key: "name", label: "Farm name" }, { key: "farmer_name", label: "Farmer" }, { key: "state_name", label: "State" }, { key: "size_hectares", label: "Area (ha)" }, { key: "status", label: "Status", status: true }],
    createPermission: "farm.create", detailHref: "/farms", searchHint: "Farm name or farm ID", statusFilter: ["DRAFT", "PENDING_VERIFICATION", "VERIFIED", "ACTIVE", "SUSPENDED", "INACTIVE", "REJECTED"],
    fields: [
      { name: "name", label: "Farm name", required: true }, { name: "farmer_id", label: "Farmer", lookup: "farmers", required: true },
      { name: "size_hectares", label: "Size in hectares", type: "number" }, { name: "tenure_type", label: "Tenure type", options: ["OWNED", "LEASED", "COMMUNAL", "OTHER"] },
      { name: "cultivation_status", label: "Cultivation status", options: ["CULTIVATED", "FALLOW", "PREPARING", "OTHER"] },
      { name: "state", label: "State" }, { name: "lga", label: "LGA" }, { name: "ward", label: "Ward" }, { name: "community", label: "Community" },
      { name: "latitude", label: "Latitude", type: "number" }, { name: "longitude", label: "Longitude", type: "number" },
      { name: "location_text", label: "Location notes", type: "textarea", wide: true },
    ],
  },
  visits: {
    title: "Field visits", eyebrow: "Field operations / Visits", endpoint: "field-visits", permission: "field_visit.read",
    columns: [{ key: "visit_at", label: "Visit date" }, { key: "farmer_name", label: "Farmer" }, { key: "farm_name", label: "Farm" }, { key: "purpose", label: "Purpose" }, { key: "status", label: "Status", status: true }],
    createPermission: "field_visit.create", detailHref: "/field-visits", paginated: false,
    fields: [{ name: "farmer", label: "Farmer", lookup: "farmers", required: true }, { name: "farm", label: "Farm", lookup: "farms", dependsOn: "farmer", required: true }, { name: "season", label: "Season", lookup: "seasons" }, { name: "visit_at", label: "Visit date and time", type: "datetime-local", required: true }, { name: "purpose", label: "Purpose", required: true }, { name: "notes", label: "Notes", type: "textarea", wide: true }, { name: "latitude", label: "Latitude", type: "number" }, { name: "longitude", label: "Longitude", type: "number" }],
  },
  reports: {
    title: "Field reports", eyebrow: "Field operations / Reports", endpoint: "field-reports", permission: "field_report.read",
    columns: [{ key: "report_reference", label: "Report ID", mono: true }, { key: "report_at", label: "Report date" }, { key: "report_type", label: "Type" }, { key: "purpose", label: "Purpose" }, { key: "status", label: "Status", status: true }],
    createPermission: "field_report.create", detailHref: "/field-reports", paginated: false,
    fields: [{ name: "report_type", label: "Report type", options: ["FIELD", "OTHER"], required: true }, { name: "farmer", label: "Farmer", lookup: "farmers" }, { name: "farm", label: "Farm", lookup: "farms", dependsOn: "farmer" }, { name: "season", label: "Season", lookup: "seasons" }, { name: "report_at", label: "Report date and time", type: "datetime-local", required: true }, { name: "latitude", label: "Latitude", type: "number" }, { name: "longitude", label: "Longitude", type: "number" }, { name: "purpose", label: "Purpose" }, { name: "topic", label: "Topic" }, { name: "summary", label: "Summary", type: "textarea", wide: true }, { name: "activities", label: "Activities", type: "textarea", wide: true }, { name: "observations", label: "Observations", type: "textarea", wide: true }, { name: "crop_condition", label: "Crop condition", type: "textarea" }, { name: "progress", label: "Progress", type: "textarea" }, { name: "challenges", label: "Challenges", type: "textarea" }, { name: "recommendations", label: "Recommendations", type: "textarea" }, { name: "next_action", label: "Next action", type: "textarea" }],
  },
  kyc: {
    title: "KYC review", eyebrow: "Verification / KYC records", endpoint: "kyc/records", permission: "kyc.read", paginated: true,
    columns: [{ key: "owner_summary", label: "Account holder" }, { key: "id_type", label: "ID type" }, { key: "verification_method", label: "Method" }, { key: "status", label: "Status", status: true }, { key: "submitted_at", label: "Submitted" }],
    createPermission: "kyc.create", detailHref: "/kyc", searchHint: "Name or email", statusFilter: kycStatuses, defaultStatus: "SUBMITTED",
    filters: [{ name: "id_type", label: "Identity type" }, { name: "user_id", label: "Owner user UUID" }],
    fields: [{ name: "id_type", label: "Identity type", options: ["NIN", "BVN", "VOTER_CARD", "DRIVERS_LICENSE", "PASSPORT", "OTHER"], required: true }, { name: "id_number", label: "Identity number", required: true }, { name: "verification_method", label: "Verification method", options: ["MANUAL", "API", "OTHER"], required: true }],
  },
  documents: {
    title: "Document library", eyebrow: "Verification / Documents", endpoint: "documents/documents", permission: "document.read",
    columns: [{ key: "file_name", label: "File" }, { key: "document_type_name", label: "Document type" }, { key: "mime_type", label: "Format" }, { key: "file_size", label: "Size" }, { key: "malware_status", label: "Scan state", status: true }, { key: "status", label: "Status", status: true }],
    detailHref: "/documents", searchHint: "File name", paginated: true,
  },
  users: {
    title: "User directory", eyebrow: "Access / Accounts", endpoint: "users/users", permission: "user.read", paginated: true,
    columns: [{ key: "first_name", label: "Name" }, { key: "email", label: "Email" }, { key: "phone_number", label: "Phone" }, { key: "user_type", label: "Account type" }, { key: "is_active", label: "Active", status: true }, { key: "roles", label: "Roles" }],
    createPermission: "user.create", detailHref: "/admin/users", searchHint: "Name, email or phone",
    filters: [{ name: "user_type", label: "Account type", options: ["STAFF", "FARMER", "INVESTOR"] }, { name: "role", label: "Role code" }, { name: "is_active", label: "Active", options: ["true", "false"] }, { name: "is_verified", label: "Phone verified", options: ["true", "false"] }, { name: "is_email_verified", label: "Email verified", options: ["true", "false"] }],
    fields: [{ name: "email", label: "Email", type: "email", required: true }, { name: "password", label: "Password", type: "password", required: true }, { name: "first_name", label: "First name", required: true }, { name: "last_name", label: "Last name", required: true }, { name: "phone_number", label: "Phone number", type: "tel", required: true }, { name: "user_type", label: "Account type", options: ["STAFF", "FARMER", "INVESTOR"], required: true }],
  },
  roles: {
    title: "Roles & scopes", eyebrow: "Access / Policies", endpoint: "users/roles", permission: "user.read",
    columns: [{ key: "name", label: "Role" }, { key: "code", label: "Code", mono: true }, { key: "is_system_role", label: "System role", status: true }, { key: "scopes", label: "Scopes" }, { key: "permissions", label: "Permissions" }],
    createPermission: "user.create", detailHref: "/admin/roles", paginated: false,
    fields: [{ name: "code", label: "Role code", required: true }, { name: "name", label: "Display name", required: true }, { name: "description", label: "Description", type: "textarea", wide: true }],
  },
  permissions: {
    title: "Permission catalogue", eyebrow: "Access / Permissions", endpoint: "users/permissions", permission: "user.read",
    columns: [{ key: "code", label: "Permission", mono: true }, { key: "description", label: "Description" }, { key: "is_system_permission", label: "System", status: true }],
    createPermission: "permission.manage", detailHref: "/admin/permissions", paginated: false,
    fields: [{ name: "code", label: "Permission code", required: true, placeholder: "records.review" }, { name: "description", label: "Description", type: "textarea", wide: true }],
  },
  archivals: {
    title: "Farmer archive approvals", eyebrow: "Governance / Maker-checker", endpoint: "farmer-deletion-requests", permission: "farmer.delete_approve",
    columns: [{ key: "farmer_id", label: "Farmer profile", mono: true }, { key: "requested_by", label: "Requested by" }, { key: "reason", label: "Request reason" }, { key: "status", label: "Status", status: true }, { key: "created_at", label: "Requested" }],
    detailHref: "/admin/archivals", paginated: true,
  },
  audit: {
    title: "Audit search", eyebrow: "Governance / Immutable events", endpoint: "audit/events", permission: "audit.read", paginated: true,
    columns: [{ key: "event_type", label: "Event" }, { key: "action", label: "Action" }, { key: "outcome", label: "Outcome", status: true }, { key: "actor_snapshot", label: "Actor" }, { key: "target_type", label: "Target type" }, { key: "created_at", label: "Time" }],
    searchHint: "Action, actor, target or request ID",
    filters: [{ name: "event_type", label: "Event type" }, { name: "action", label: "Action" }, { name: "outcome", label: "Outcome" }, { name: "actor_id", label: "Actor UUID" }, { name: "target_type", label: "Target type" }, { name: "target_id", label: "Target UUID" }, { name: "request_id", label: "Request ID" }, { name: "created_after", label: "Created after", type: "date" }, { name: "created_before", label: "Created before", type: "date" }],
  },
  support: {
    title: "Support tickets", eyebrow: "Help / Support", endpoint: "support/tickets", permission: "support_ticket.read", paginated: false,
    columns: [{ key: "subject", label: "Subject" }, { key: "status", label: "Status", status: true }, { key: "created_at", label: "Created" }, { key: "updated_at", label: "Updated" }],
    createPermission: "support_ticket.create", detailHref: "/support", searchHint: "Subject",
    fields: [{ name: "subject", label: "Subject", required: true }, { name: "description", label: "Description", type: "textarea", required: true, wide: true }],
  },
  farmCrops: {
    title: "Farm-season crops", eyebrow: "Agronomy / Crop records", endpoint: "farm-crops/farm-crops", permission: "farm_crop.read",
    columns: [{ key: "farm_name", label: "Farm" }, { key: "crop_name", label: "Crop" }, { key: "season_name", label: "Season" }, { key: "area_hectares", label: "Area" }, { key: "status", label: "Status", status: true }],
    createPermission: "farm_crop.create", detailHref: "/farm-crops", paginated: false,
    fields: [{ name: "farm", label: "Farm", lookup: "farms", required: true }, { name: "crop", label: "Crop", lookup: "crops", required: true }, { name: "season", label: "Season", lookup: "seasons", required: true }, { name: "area_hectares", label: "Area (ha)", type: "number" }, { name: "planted_at", label: "Planted date", type: "date" }, { name: "expected_harvest_at", label: "Expected harvest", type: "date" }, { name: "expected_yield", label: "Expected yield", type: "number" }],
  },
  cropActivities: {
    title: "Crop activity log", eyebrow: "Agronomy / Activity history", endpoint: "crop-activities", permission: "crop_activity.read",
    columns: [{ key: "farm_crop_label", label: "Farm · Crop · Season" }, { key: "activity_type", label: "Activity" }, { key: "activity_date", label: "Date" }, { key: "description", label: "Description" }, { key: "quantity", label: "Quantity" }],
    createPermission: "crop_activity.create", paginated: false,
    fields: [{ name: "farm_crop", label: "Farm crop", lookup: "farmCrops", required: true }, { name: "activity_type", label: "Activity type", required: true }, { name: "activity_date", label: "Activity date", type: "date", required: true }, { name: "description", label: "Description", type: "textarea", wide: true }, { name: "quantity", label: "Quantity", type: "number" }, { name: "unit", label: "Unit" }],
  },
  officers: {
    title: "Field officers", eyebrow: "People / Field team", endpoint: "field-officers/field-officers", permission: "field_officer.read", paginated: true,
    columns: [{ key: "officer_number", label: "Officer ID", mono: true }, { key: "first_name", label: "Name" }, { key: "email", label: "Email" }, { key: "region_lgas", label: "Coverage" }, { key: "active", label: "Active", status: true }],
    createPermission: "field_officer.create", detailHref: "/field-officers",
    fields: [{ name: "email", label: "Email", type: "email", required: true }, { name: "password", label: "Initial password", type: "password", required: true }, { name: "first_name", label: "First name", required: true }, { name: "last_name", label: "Last name", required: true }, { name: "phone_number", label: "Phone number", type: "tel" }],
  },
  assignments: {
    title: "Field assignments", eyebrow: "People / Coverage", endpoint: "field-officers/assignments", permission: "assignment.manage", paginated: true,
    columns: [{ key: "field_officer", label: "Officer" }, { key: "farmer", label: "Farmer" }, { key: "farm", label: "Farm" }, { key: "active", label: "Active", status: true }, { key: "assigned_at", label: "Assigned" }],
    createPermission: "assignment.manage",
    fields: [{ name: "field_officer_id", label: "Field officer", lookup: "staffUsers", required: true }, { name: "farmer_id", label: "Farmer", lookup: "farmers" }, { name: "farm_id", label: "Farm", lookup: "farms" }],
  },
  documentTypes: {
    title: "Document types", eyebrow: "Verification / Document catalogue", endpoint: "document-types", permission: "document_type.read", paginated: false,
    columns: [{ key: "name", label: "Name" }, { key: "category", label: "Category" }, { key: "is_required_for_kyc", label: "Required for KYC", status: true }, { key: "active", label: "Active", status: true }],
    createPermission: "document_type.create", detailHref: "/document-types",
    fields: [{ name: "name", label: "Document name", required: true }, { name: "category", label: "Category", required: true }, { name: "is_required_for_kyc", label: "Required for KYC", options: ["true", "false"], required: true }, { name: "active", label: "Active", options: ["true", "false"], required: true }],
  },
  crops: {
    title: "Crop catalogue", eyebrow: "Agronomy / Reference data", endpoint: "crops/crops", permission: "crop.read", paginated: false,
    columns: [{ key: "name", label: "Crop" }, { key: "category", label: "Category" }, { key: "unit_of_measure", label: "Unit" }, { key: "active", label: "Active", status: true }],
    createPermission: "crop.manage", fields: [{ name: "name", label: "Crop name", required: true }, { name: "category", label: "Category" }, { name: "unit_of_measure", label: "Unit of measure", required: true }, { name: "active", label: "Active", options: ["true", "false"] }],
  },
  seasons: {
    title: "Seasons", eyebrow: "Agronomy / Reference data", endpoint: "seasons", permission: "season.read", paginated: false,
    columns: [{ key: "name", label: "Season" }, { key: "year", label: "Year" }, { key: "status", label: "Status", status: true }],
    createPermission: "season.manage", fields: [{ name: "name", label: "Season name", required: true }, { name: "year", label: "Year", type: "number", required: true }, { name: "start_date", label: "Start date", type: "date", required: true }, { name: "end_date", label: "End date", type: "date", required: true }, { name: "status", label: "Status", options: ["PLANNED", "ACTIVE", "CLOSED"] }],
  },
};

function valueAt(record: Row, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Row)[part] : undefined, record);
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(display).join(", ") || "—";
  if (typeof value === "object") { const record = value as Row; return record.name && record.state_name ? `${display(record.name)}, ${display(record.state_name)}` : display(record.name ?? record.email ?? record.code ?? record.id ?? record.detail ?? "—"); }
  const text = String(value);
  if (/T\d\d:\d\d/.test(text)) { const date = new Date(text); if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date); }
  return text;
}

function recordId(record: Row) { return String(record.id ?? record.pk ?? ""); }
function hasPermission(session: SessionInfo, permission?: string) { return Boolean(permission && !session.permissionError && session.permissions.includes(permission)); }
function hasScope(session: SessionInfo, allowed: string[]) { return session.roles.some((role) => role && typeof role === "object" && Array.isArray((role as Row).scopes) && ((role as Row).scopes as string[]).some((scope) => allowed.includes(scope) || scope === "ALL")); }
function hasRole(session: SessionInfo, code: string) { return session.roles.some((role) => role && typeof role === "object" && (role as Row).code === code && (role as Row).is_active !== false); }
function pageData(payload: unknown): { rows: Row[]; count: number; next: boolean } {
  if (Array.isArray(payload)) return { rows: payload as Row[], count: payload.length, next: false };
  if (payload && typeof payload === "object" && "results" in payload) { const result = payload as Page<Row>; return { rows: result.results ?? [], count: result.count ?? result.results?.length ?? 0, next: Boolean(result.next) }; }
  return { rows: [], count: 0, next: false };
}

function heading(title: string, eyebrow: string, description?: string) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">{eyebrow}</div><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[30px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>}</div></div>;
}

export default function WorkflowPages({ path, session, onToast, onSessionRefresh }: { path: string; session: SessionInfo; onToast: (message: string) => void; onSessionRefresh: () => Promise<void> }) {
  const segments = path.split("/").filter(Boolean);
  const section = segments[0] ?? "overview";
  const id = segments.at(-1);
  const isDetail = (section === "admin" ? segments.length > 2 : segments.length > 1) && id !== "new";
  const key = section === "field-visits" ? "visits" : section === "field-reports" ? "reports" : section === "kyc" ? "kyc" : section === "admin" ? segments[1] === "users" ? "users" : segments[1] === "roles" ? "roles" : segments[1] === "permissions" ? "permissions" : segments[1] === "archivals" ? "archivals" : "" : section === "document-types" ? "documentTypes" : section === "audit" ? "audit" : section === "support" ? "support" : section === "farm-crops" ? "farmCrops" : section === "crop-activities" ? "cropActivities" : section === "field-officers" ? "officers" : section === "assignments" ? "assignments" : section;
  const resource = resources[key];
  const requiredPermission = resource ? id === "new" ? resource.createPermission : resource.permission : undefined;

  if (session.user.user_type === "FARMER" && ["farmers", "crops", "seasons", "document-types"].includes(section)) return <NotAvailable path={path} />;

  if (requiredPermission && !hasPermission(session, requiredPermission)) return <Denied title={resource.title} permission={requiredPermission} />;

  if (section === "overview") return <Dashboard session={session} />;
  if (section === "offline-sync") return <OfflineSyncPage session={session} onToast={onToast} />;
  if (section === "account" && segments[1] === "password") return <PasswordChangePage onToast={onToast} />;
  if (section === "account" && segments[1] === "profile") return <AccountProfilePage session={session} />;
  if (section === "farmers" && id === "new") return <CreatePage resource={resources.farmers} session={session} onToast={onToast} />;
  if (section === "farmers" && isDetail) return <FarmerDetail id={id!} session={session} onToast={onToast} />;
  if (section === "farms" && id === "new") return <CreatePage resource={resources.farms} session={session} onToast={onToast} />;
  if (section === "farms" && isDetail) return <FarmDetail id={id!} session={session} onToast={onToast} />;
  if (section === "field-visits" && isDetail) return <VisitDetail id={id!} session={session} />;
  if (section === "field-reports" && isDetail) return <ReportDetail id={id!} session={session} onToast={onToast} />;
  if (section === "kyc" && isDetail) return <KycDetail id={id!} session={session} onToast={onToast} />;
  if (section === "documents" && isDetail) return <RecordDetail id={id!} title="Document record" eyebrow="Verification / Documents" endpoint={`documents/documents/${id}`} session={session} />;
  if (section === "farm-crops" && isDetail) return <RecordDetail id={id!} title="Farm-season crop" eyebrow="Agronomy / Crop record" endpoint={`farm-crops/farm-crops/${id}`} session={session} editableFields={[{ name: "area_hectares", label: "Area (ha)", type: "number" }, { name: "planted_at", label: "Planted date", type: "date" }, { name: "expected_harvest_at", label: "Expected harvest", type: "date" }, { name: "actual_harvest_at", label: "Actual harvest", type: "date" }, { name: "expected_yield", label: "Expected yield", type: "number" }, { name: "actual_yield", label: "Actual yield", type: "number" }, { name: "quality_grade", label: "Quality grade" }, { name: "status", label: "Status" }]} editPermission="farm_crop.update" />;
  if (section === "field-officers" && isDetail) return <RecordDetail id={id!} title="Field officer" eyebrow="People / Field team" endpoint={`field-officers/field-officers/${id}`} session={session} editableFields={[{ name: "region", label: "Region" }, { name: "active", label: "Active", options: ["true", "false"] }]} editPermission="field_officer.update" />;
  if (section === "admin" && segments[1] === "users" && segments[3] === "permissions") return <UserPermissionManagement id={segments[2]} session={session} onToast={onToast} onSessionRefresh={onSessionRefresh} />;
  if (section === "admin" && segments[1] === "users" && isDetail) return <UserDetail id={id!} session={session} onToast={onToast} onSessionRefresh={onSessionRefresh} />;
  if (section === "admin" && segments[1] === "roles" && isDetail) return <RoleDetail id={id!} session={session} onToast={onToast} onSessionRefresh={onSessionRefresh} />;
  if (section === "admin" && segments[1] === "archivals" && isDetail) return <ArchiveDetail id={id!} session={session} onToast={onToast} />;
  if (section === "admin" && segments[1] === "permissions" && isDetail) return <PermissionDetail id={id!} session={session} onToast={onToast} />;
  if (section === "document-types" && isDetail) return <DocumentTypeDetail id={id!} session={session} onToast={onToast} />;
  if (section === "support" && isDetail) return <SupportDetail id={id!} session={session} onToast={onToast} />;

  if (!resource) return <NotAvailable path={path} />;
  if (id === "new") return <CreatePage resource={resource} session={session} onToast={onToast} />;
  return <ResourcePage resource={resource} session={session} onToast={onToast} />;
}

function OfflineSyncPage({ session, onToast }: { session: SessionInfo; onToast: (message: string) => void }) {
  const canQueueService = hasPermission(session, "service_request.create");
  const canQueueReport = hasPermission(session, "field_report.create");
  const [online, setOnline] = useState(false);
  const [entries, setEntries] = useState<OfflineEntry[]>([]);
  const [serverEntries, setServerEntries] = useState<Row[]>([]);
  const [serviceError, setServiceError] = useState<unknown>(null);
  const [reportError, setReportError] = useState<unknown>(null);
  const [syncError, setSyncError] = useState<unknown>(null);
  const [encryptedQueueAvailable, setEncryptedQueueAvailable] = useState<boolean | null>(null);
  const [serviceValues, setServiceValues] = useState<Record<string, string>>({});
  const [reportValues, setReportValues] = useState<Record<string, string>>({ report_type: "FIELD" });
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [serverRefresh, setServerRefresh] = useState(0);
  const canReadSynced = hasPermission(session, "service_request.read");

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => { window.removeEventListener("online", updateStatus); window.removeEventListener("offline", updateStatus); };
  }, []);
  useEffect(() => {
    let active = true;
    const available = isEncryptedOfflineQueueAvailable();
    Promise.resolve().then(() => { if (active) setEncryptedQueueAvailable(available); });
    if (available) readOfflineEntries().then((records) => { if (active) setEntries(records); }).catch((reason: unknown) => { if (active) setSyncError(reason); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => { if (!online || !canReadSynced) return; let active = true; apiRequest<Row[]>("field-offline/service-requests").then((records) => { if (active) setServerEntries(records); }).catch((reason: unknown) => { if (active) setSyncError(reason); }); return () => { active = false; }; }, [canReadSynced, online, serverRefresh]);

  if (!canQueueService && !canQueueReport) return <Denied title="Offline field sync" permission="service_request.create or field_report.create" />;

  async function queue(kind: OfflineEntry["kind"], payload: Record<string, unknown>) {
    if (!isEncryptedOfflineQueueAvailable()) throw new Error("Encrypted offline storage requires HTTPS. Open this page over a secure connection to queue work.");
    const entry: OfflineEntry = { device_reference: createUuid(), kind, created_at: new Date().toISOString(), payload };
    await storeOfflineEntry(entry);
    setRefresh((value) => value + 1);
    onToast("Saved to encrypted offline queue. This is not yet server-confirmed.");
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setServiceError(null);
    const formElement = event.currentTarget;
    const payload = Object.fromEntries([...new FormData(formElement).entries()].filter(([, value]) => String(value).trim() !== ""));
    if (!payload.farmer && !(payload.customer_name && payload.customer_phone)) { setServiceError("Select a farmer or provide both customer name and phone number."); return; }
    try { await queue("service-request", payload); formElement.reset(); setServiceValues({}); }
    catch (reason) { setServiceError(reason); }
  }

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setReportError(null);
    const formElement = event.currentTarget;
    const payload = Object.fromEntries([...new FormData(formElement).entries()].filter(([, value]) => String(value).trim() !== ""));
    if (payload.report_type === "FIELD" && (!payload.farmer || !payload.farm)) { setReportError("FIELD reports require both farmer and farm IDs."); return; }
    if (payload.report_type === "OTHER") { delete payload.farmer; delete payload.farm; }
    try { await queue("field-report", payload); formElement.reset(); setReportValues({ report_type: "FIELD" }); }
    catch (reason) { setReportError(reason); }
  }

  async function syncQueued() {
    if (!online || busy) return;
    setBusy(true); setSyncError(null);
    try {
      for (const entry of entries) {
        if (entry.conflict) continue;
        const path = entry.kind === "service-request" ? "field-offline/service-requests" : "field-offline/field-reports";
        const body = entry.kind === "service-request" ? { device_reference: entry.device_reference, ...entry.payload } : { device_reference: entry.device_reference, report: entry.payload };
        try {
          await apiRequest(path, { method: "POST", body });
          await removeOfflineEntry(entry.device_reference);
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 409) {
            const conflict = reason.payload && typeof reason.payload === "object" ? reason.payload : { detail: errorMessage(reason) };
            await storeOfflineEntry({ ...entry, conflict });
          } else throw reason;
        }
      }
      setRefresh((value) => value + 1);
      setServerRefresh((value) => value + 1);
      onToast("Sync finished. Conflicts remain queued for review.");
    } catch (reason) { setSyncError(reason); }
    finally { setBusy(false); }
  }

  function exportConflict(entry: OfflineEntry) {
    const blob = new Blob([JSON.stringify({ local: entry.payload, server: entry.conflict }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `delainah-conflict-${entry.device_reference}.json`; link.click(); URL.revokeObjectURL(url);
  }

  return <>{heading("Offline field sync", "Field operations / Sync", "Queue supported service requests and field reports securely, then replay them with their original device reference.")}
    {encryptedQueueAvailable === false && <div role="status" className="mb-5 rounded-lg border border-[#efc9c0] bg-[#fff6f3] px-4 py-3 text-xs leading-5 text-[#964d3e]">Encrypted offline storage requires HTTPS. Server-confirmed records remain available, but local queue records cannot be read or added over this HTTP connection.</div>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-white px-5 py-4"><div><div className="eyebrow">Connection</div><div className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${online ? "bg-[#55a36e]" : "bg-[var(--coral)]"}`} />{online ? "Online" : "Offline"}</div></div><div className="flex items-center gap-3"><span className="mono text-[11px] text-[var(--muted)]">{entries.length} queued</span><button disabled={!online || busy || entries.length === 0} onClick={() => void syncQueued()} className="primary-button"><RefreshCw size={14} className={busy ? "animate-spin" : ""} />{busy ? "Syncing…" : "Sync queued work"}</button></div></div>
    {Boolean(syncError) && <div className="mb-5"><ErrorPanel error={syncError} /></div>}
    <div className="grid gap-5 xl:grid-cols-2">
      {canQueueService && <form onSubmit={saveService} className="surface-panel p-5 sm:p-6"><div className="eyebrow">Service request</div><h2 className="mt-1 text-sm font-semibold">Queue a request</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Requires a service ID and either a farmer or customer name plus phone.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <OfflineField name="service" label="Service ID" required />
        <LookupSelect field={{ name: "farmer", label: "Farmer", lookup: "farmers" }} session={session} value={serviceValues.farmer ?? ""} dependencyValue="" onChange={(value) => setServiceValues((current) => ({ ...current, farmer: value, farm: "" }))} />
        <LookupSelect field={{ name: "farm", label: "Farm", lookup: "farms", dependsOn: "farmer" }} session={session} value={serviceValues.farm ?? ""} dependencyValue={serviceValues.farmer ?? ""} onChange={(value) => setServiceValues((current) => ({ ...current, farm: value }))} />
        <OfflineField name="customer_name" label="Customer name" /><OfflineField name="customer_phone" label="Customer phone" type="tel" /><OfflineField name="requested_date" label="Requested date" type="date" /><OfflineField name="requested_acreage" label="Acreage" type="number" /><OfflineField name="estimated_cost" label="Estimated cost" type="number" />
        <LookupSelect field={{ name: "season", label: "Season", lookup: "seasons" }} session={session} value={serviceValues.season ?? ""} dependencyValue="" onChange={(value) => setServiceValues((current) => ({ ...current, season: value }))} />
        <LookupSelect field={{ name: "crop", label: "Crop", lookup: "crops" }} session={session} value={serviceValues.crop ?? ""} dependencyValue="" onChange={(value) => setServiceValues((current) => ({ ...current, crop: value }))} />
        <OfflineField name="location" label="Location" /><OfflineField name="notes" label="Notes" />
      </div>{Boolean(serviceError) && <div className="mt-4"><ErrorPanel error={serviceError} /></div>}<button className="primary-button mt-5"><Plus size={14} /> Save request offline</button></form>}
      {canQueueReport && <form onSubmit={saveReport} className="surface-panel p-5 sm:p-6"><div className="eyebrow">Field or other report</div><h2 className="mt-1 text-sm font-semibold">Queue a report</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">A field report includes the associated farmer and farm.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="field-label">Report type<select className="field-control" name="report_type" value={reportValues.report_type} required onChange={(event) => setReportValues((current) => ({ ...current, report_type: event.target.value, ...(event.target.value === "OTHER" ? { farmer: "", farm: "" } : {}) }))}><option value="FIELD">Field</option><option value="OTHER">Other</option></select></label>
        <OfflineField name="report_at" label="Report date and time" type="datetime-local" required />
        {reportValues.report_type === "FIELD" && <><LookupSelect field={{ name: "farmer", label: "Farmer", lookup: "farmers", required: true }} session={session} value={reportValues.farmer ?? ""} dependencyValue="" onChange={(value) => setReportValues((current) => ({ ...current, farmer: value, farm: "" }))} /><LookupSelect field={{ name: "farm", label: "Farm", lookup: "farms", dependsOn: "farmer", required: true }} session={session} value={reportValues.farm ?? ""} dependencyValue={reportValues.farmer ?? ""} onChange={(value) => setReportValues((current) => ({ ...current, farm: value }))} /></>}
        <LookupSelect field={{ name: "season", label: "Season", lookup: "seasons" }} session={session} value={reportValues.season ?? ""} dependencyValue="" onChange={(value) => setReportValues((current) => ({ ...current, season: value }))} />
        <OfflineField name="project" label="Project ID" /><OfflineField name="purpose" label="Purpose" /><OfflineField name="topic" label="Topic" /><OfflineField name="summary" label="Summary" wide /><OfflineField name="activities" label="Activities" wide /><OfflineField name="observations" label="Observations" wide /><OfflineField name="crop_condition" label="Crop condition" /><OfflineField name="progress" label="Progress" /><OfflineField name="challenges" label="Challenges" /><OfflineField name="recommendations" label="Recommendations" /><OfflineField name="next_action" label="Next action" />
      </div>{Boolean(reportError) && <div className="mt-4"><ErrorPanel error={reportError} /></div>}<button className="primary-button mt-5"><Plus size={14} /> Save report offline</button></form>}
    </div>
    <section className="surface-panel mt-5 overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><div className="eyebrow">Encrypted local queue</div><h2 className="mt-1 text-sm font-semibold">Pending sync</h2></div><span className="status-pill status-wait">OFFLINE DATA</span></div>{encryptedQueueAvailable === false ? <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">Local queue contents require a secure HTTPS connection to read.</p> : encryptedQueueAvailable === null ? <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">Checking encrypted storage…</p> : entries.length === 0 ? <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">No local records are queued.</p> : <div className="divide-y divide-[var(--line)]">{entries.map((entry) => <article key={entry.device_reference} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`status-pill ${entry.conflict ? "status-bad" : "status-wait"}`}>{entry.conflict ? "CONFLICT" : "OFFLINE"}</span><span className="text-xs font-semibold">{entry.kind === "service-request" ? "Service request" : "Field report"}</span></div><div className="mono mt-2 text-[10px] text-[var(--muted)]">device_reference: {entry.device_reference}</div><div className="mt-1 text-[10px] text-[var(--muted)]">Saved {display(entry.created_at)}</div></div>{Boolean(entry.conflict) && <button className="secondary-button" onClick={() => exportConflict(entry)}>Export conflict bundle</button>}</div>{Boolean(entry.conflict) && <div className="mt-4 rounded-lg border border-[#efc9c0] bg-[#fff6f3] p-3"><div className="text-xs font-semibold text-[#964d3e]">Server reported a payload conflict</div><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-[#77554f]">{JSON.stringify(entry.conflict, null, 2)}</pre><p className="mt-2 text-[10px] leading-5 text-[#964d3e]">No conflict-resolution endpoint is mounted. This item remains encrypted and queued; do not resend it with changed data.</p></div>}</article>)}</div>}</section>
    {canReadSynced && <section className="surface-panel mt-5 overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><div className="eyebrow">Server confirmed</div><h2 className="mt-1 text-sm font-semibold">Synced service requests</h2></div><button className="icon-button" title="Refresh synced requests" aria-label="Refresh synced requests" onClick={() => setServerRefresh((value) => value + 1)}><RefreshCw size={14} /></button></div>{serverEntries.length === 0 ? <p className="px-5 py-6 text-xs text-[var(--muted)]">No confirmed offline service requests returned.</p> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Device reference</th><th>Request</th><th>Status</th><th>Updated</th></tr></thead><tbody>{serverEntries.map((entry, index) => <tr key={String(entry.id ?? index)}><td className="mono text-[10px]">{display(entry.device_reference)}</td><td>{display(entry.entity_id ?? entry.service_request ?? entry.entity_type)}</td><td><span className={`status-pill ${statusClass(display(entry.status))}`}>{display(entry.status)}</span></td><td>{display(entry.updated_at ?? entry.created_at)}</td></tr>)}</tbody></table></div>}</section>}
  </>;
}

function OfflineField({ name, label, type = "text", required = false, wide = false }: { name: string; label: string; type?: string; required?: boolean; wide?: boolean }) {
  return <label className={`field-label ${wide ? "sm:col-span-2" : ""}`}>{label}<input className="field-control" name={name} type={type} required={required} /></label>;
}

function PasswordChangePage({ onToast }: { onToast: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("new_password") !== form.get("confirm_password")) { setError("The new passwords do not match."); setBusy(false); return; }
    try {
      await apiRequest("auth/change-password", { method: "POST", body: { current_password: form.get("current_password"), new_password: form.get("new_password") } });
      formElement.reset(); setSaved(true); onToast("Password changed.");
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  return <>{heading("Change password", "Account / Security", "Use your current password to set a new credential.")}<form onSubmit={submit} className="surface-panel max-w-xl space-y-4 p-5 sm:p-7"><label className="field-label">Current password<input className="field-control" type="password" name="current_password" autoComplete="current-password" required /></label><label className="field-label">New password<input className="field-control" type="password" name="new_password" autoComplete="new-password" minLength={8} required /></label><label className="field-label">Confirm new password<input className="field-control" type="password" name="confirm_password" autoComplete="new-password" minLength={8} required /></label>{Boolean(error) && <ErrorPanel error={error} />}{saved && <p role="status" className="text-xs text-[#3e8057]">Password updated.</p>}<div className="flex justify-end border-t border-[var(--line)] pt-4"><button disabled={busy} className="primary-button">{busy ? "Saving…" : "Change password"}</button></div></form></>;
}

function ResourcePage({ resource, session, onToast }: { resource: Resource; session: SessionInfo; onToast: (message: string) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(resource.defaultStatus ?? "");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const allowed = hasPermission(session, resource.permission);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const queryValues: Record<string, string | number | undefined> = { ...(resource.paginated ? { page, page_size: 25 } : {}), search: search || undefined, ...(status ? { status } : {}), ...filters };
    const query = pageQuery(queryValues);
    Promise.resolve().then(() => {
      if (active) { setLoading(true); setError(null); }
      return apiRequest<unknown>(`${resource.endpoint}${query}`);
    })
      .then((payload) => { if (active) { const result = pageData(payload); setRows(result.rows); setCount(result.count); setHasNext(result.next); } })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, filters, page, refreshIndex, resource, search, status]);

  if (!allowed) return <Denied title={resource.title} permission={resource.permission} />;
  const canCreate = hasPermission(session, resource.createPermission);
  const createPath = `/${routeForResource(resource)}/new`;
  const canOpenDetails = resource !== resources.documentTypes || hasScope(session, ["OPS"]);

  async function toggleAssignment(row: Row) {
    const id = recordId(row);
    if (!id) return;
    try {
      const updated = await apiRequest<Row>(`field-officers/assignments/${id}`, { method: "PATCH", body: { active: !Boolean(row.active) } });
      setRows((current) => current.map((item) => recordId(item) === id ? { ...item, active: updated.active } : item));
      onToast(updated.active ? "Assignment reactivated." : "Assignment deactivated.");
    } catch (reason) { setError(reason); }
  }

  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">{heading(resource.title, resource.eyebrow)}{resource === resources.farms && hasPermission(session, "farmer.create") && <Link href="/farmers/new" className="danger-button font-bold"><Plus size={14} /> Create farmer first</Link>}</div>
    <section className="surface-panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <label className="relative min-w-[220px] flex-1 sm:max-w-[390px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={resource.searchHint ?? "Search records"} className="field-control !h-10 !pl-9" /></label>
        {resource.statusFilter && <label className="relative"><Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><select className="field-control !h-10 min-w-[160px] !pl-9" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">All statuses</option>{resource.statusFilter.map((value) => <option key={value}>{value}</option>)}</select></label>}
        <button onClick={() => setRefreshIndex((value) => value + 1)} className="icon-button" title="Refresh list" aria-label="Refresh list"><RefreshCw size={15} /></button>
        {canCreate && <Link href={createPath} className="primary-button ml-auto"><Plus size={15} /> New record</Link>}
      </div>
      {resource.filters && <details className="border-b border-[var(--line)] px-4 py-3 sm:px-5"><summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">Advanced filters</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{resource.filters.map((field) => {
        if (["state", "lga", "ward"].includes(field.name)) {
          if (field.name !== "state") return null;
          return <GeographySelects key="registry-geography-filters" values={{ state: filters.state ?? "", lga: filters.lga ?? "", ward: filters.ward ?? "" }} onChange={(values) => { setPage(1); setFilters((current) => ({ ...current, ...values })); }} />;
        }
        return <label className="field-label" key={field.name}>{field.label}{field.options ? <select className="field-control" value={filters[field.name] ?? ""} onChange={(event) => { setPage(1); setFilters((value) => ({ ...value, [field.name]: event.target.value })); }}><option value="">Any</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input className="field-control" type={field.type ?? "text"} value={filters[field.name] ?? ""} onChange={(event) => { setPage(1); setFilters((value) => ({ ...value, [field.name]: event.target.value })); }} />}</label>;
      })}</div><button type="button" className="mt-3 text-[10px] font-semibold text-[var(--leaf)]" onClick={() => { setFilters({}); setPage(1); }}>Clear advanced filters</button></details>}
      {Boolean(error) && <div className="m-4"><ErrorPanel error={error} onRetry={() => setRefreshIndex((value) => value + 1)} /></div>}
      {loading ? <LoadingState label="Loading records" /> : !error && rows.length === 0 ? <div className="grid min-h-56 place-items-center px-5 text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#edf3ee] text-[var(--leaf)]"><FilePlus2 size={18} /></span><p className="mt-3 text-sm font-semibold">No records found</p><p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">{resource.empty ?? "Try another search or refresh the list."}</p>{canCreate && <Link href={createPath} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--leaf)]">Create record <ArrowRight size={13} /></Link>}</div></div> : !error && <div className="overflow-x-auto"><table className="data-table"><thead><tr>{resource.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th className="w-12" /></tr></thead><tbody>{rows.map((row, index) => {
        const rowId = recordId(row);
        const href = canOpenDetails && resource.detailHref && rowId ? `${resource.detailHref}/${rowId}` : undefined;
        return <tr key={rowId || index} onClick={() => href && router.push(href)} className={href ? "cursor-pointer hover:bg-[#f8faf7]" : ""}>{resource.columns.map((column) => {
          const value = valueAt(row, column.key);
          const rendered = column.key === "first_name" && row.last_name ? `${display(value)} ${display(row.last_name)}` : column.key === "owner_summary" && value && typeof value === "object" ? display((value as Row).name ?? (value as Row).email) : column.key === "actor_snapshot" && value && typeof value === "object" ? display((value as Row).email ?? (value as Row).name) : display(value);
          return <td key={column.key}><span className={`${column.mono ? "mono text-[11px]" : ""} ${column.status ? `status-pill ${statusClass(rendered)}` : ""}`} title={rendered}>{rendered}</span></td>;
        })}<td className="text-right">{resource === resources.assignments && hasPermission(session, "assignment.manage") ? <button className="text-[10px] font-semibold text-[var(--leaf)]" onClick={(event) => { event.stopPropagation(); void toggleAssignment(row); }}>{row.active ? "Deactivate" : "Reactivate"}</button> : href && <ArrowRight size={15} className="text-[#9aaba0]" />}</td></tr>;
      })}</tbody></table></div>}
      {resource.paginated && count > 0 && <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)] sm:px-5"><span>{count.toLocaleString()} records · page {page}</span><div className="flex gap-2"><button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button><button className="icon-button" disabled={!hasNext} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div></div>}
    </section>
    {resource === resources.documents && hasPermission(session, "document_type.read") && hasScope(session, ["OPS"]) && <Link href="/document-types" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--leaf)]">Manage document types <ArrowRight size={13} /></Link>}
    {resource === resources.kyc && hasPermission(session, "kyc.create") && <p className="mt-4 text-xs leading-5 text-[var(--muted)]">KYC creation is only available in the signed-in user’s own account context. Field officers cannot create KYC for another farmer.</p>}
  </>;
}

function CreatePage({ resource, session, onToast }: { resource: Resource; session: SessionInfo; onToast: (message: string) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [states, setStates] = useState<Row[]>([]);
  const [lgas, setLgas] = useState<Row[]>([]);
  const [wards, setWards] = useState<Row[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedLga, setSelectedLga] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldOfficerRegionsReady, setFieldOfficerRegionsReady] = useState(false);
  const canCreate = hasPermission(session, resource.createPermission);

  useEffect(() => { if (resource === resources.farmers || resource === resources.farms) apiRequest<Row[]>("geography/states").then(setStates).catch(() => setStates([])); }, [resource]);
  useEffect(() => { if (selectedState) apiRequest<Row[]>(`geography/states/${selectedState}/lgas`).then(setLgas).catch(() => setLgas([])); }, [selectedState]);
  useEffect(() => { if (selectedLga) apiRequest<Row[]>(`geography/lgas/${selectedLga}/wards`).then(setWards).catch(() => setWards([])); }, [selectedLga]);

  function changeState(value: string) { setSelectedState(value); setSelectedLga(""); setLgas([]); setWards([]); }
  function changeLga(value: string) { setSelectedLga(value); setWards([]); }

  if (!canCreate || !resource.fields) return <Denied title={`New ${resource.title.toLowerCase()}`} permission={resource.createPermission ?? "create"} />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resource === resources.officers && !fieldOfficerRegionsReady) {
      setError("Wait for the officer coverage options to load before creating the account.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== "")) as Row;
    if (typeof body.region_lgas === "string") body.region_lgas = JSON.parse(body.region_lgas) as string[];
    if ((body.latitude && !body.longitude) || (!body.latitude && body.longitude)) { setError("Enter both latitude and longitude, or leave both blank."); setBusy(false); return; }
    if (body.latitude && (Number(body.latitude) < -90 || Number(body.latitude) > 90)) { setError("Latitude must be between -90 and 90."); setBusy(false); return; }
    if (body.longitude && (Number(body.longitude) < -180 || Number(body.longitude) > 180)) { setError("Longitude must be between -180 and 180."); setBusy(false); return; }
    const reportType = String(body.report_type ?? "");
    if (resource === resources.reports && reportType === "FIELD" && (!body.farmer || !body.farm)) { setError("FIELD reports require both a farmer and a farm."); setBusy(false); return; }
    if (resource === resources.reports && reportType === "OTHER") { delete body.farmer; delete body.farm; }
    for (const name of ["active", "is_required_for_kyc"]) if (body[name] !== undefined) body[name] = body[name] === "true";
    try {
      const result = await apiRequest<Row>(resource.endpoint, { method: "POST", body });
      const newId = recordId(result);
      const destination = resource.detailHref && newId ? `${resource.detailHref}/${newId}` : `/${routeForResource(resource)}`;
      if (resource === resources.farmers && result.registration_source === "OFFICER") {
        if (!newId) {
          onToast("Farmer created, but automatic submission and sign-off could not run because the server response did not include a profile ID.");
          router.push("/farms/new");
          return;
        }
        try {
          await apiRequest<Row>(`farmers/farmers/${newId}/submit`, { method: "POST", body: {} });
        } catch (reason) {
          onToast(`Farmer created, but submission failed; the profile may still be a draft. ${errorMessage(reason)}`);
          router.push(`/farms/new?farmer_id=${encodeURIComponent(newId)}`);
          return;
        }
        try {
          await apiRequest<Row>(`farmers/farmers/${newId}/field-officer-signoff`, { method: "POST", body: {} });
        } catch (reason) {
          onToast(`Farmer created and submitted, but field-officer sign-off failed. ${errorMessage(reason)}`);
          router.push(`/farms/new?farmer_id=${encodeURIComponent(newId)}`);
          return;
        }
        onToast("Farmer created, submitted for verification, and signed off. Continue by adding a farm.");
        router.push(`/farms/new?farmer_id=${encodeURIComponent(newId)}`);
        return;
      } else if (resource === resources.farmers) {
        if (newId) {
          onToast("Farmer created. Continue by adding a farm.");
          router.push(`/farms/new?farmer_id=${encodeURIComponent(newId)}`);
        } else {
          onToast("Farmer created, but the server response did not include a profile ID to preselect for farm creation.");
          router.push("/farms/new");
        }
        return;
      } else {
        onToast(resource === resources.kyc ? "KYC draft created. Add the required documents before submitting." : "Record created from the server response.");
      }
      router.push(destination);
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  const createDescription = resource === resources.farmers
    ? "Create a provisional farmer profile. Phone verification and a permanent Farmer Number happen separately."
    : resource === resources.kyc
      ? "Create a KYC draft, then add the required identity documents on the next screen before submitting it for review."
      : undefined;
  return <><Link href={`/${routeForResource(resource)}`} className="back-link"><ArrowLeft size={14} /> Back to {resource.title.toLowerCase()}</Link>{heading(`New ${resource.title.replace(/s$/, "").toLowerCase()}`, resource.eyebrow, createDescription)}
    <form onSubmit={submit} className="surface-panel max-w-4xl p-5 sm:p-7"><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{resource.fields.map((field) => {
      if (resource === resources.farms && field.name === "farmer_id" && session.user.user_type === "FARMER") return null;
      if (resource === resources.kyc && field.name === "verification_method" && ["FARMER", "INVESTOR"].includes(session.user.user_type ?? "")) return null;
      if (resource === resources.reports && fieldValues.report_type === "OTHER" && ["farmer", "farm"].includes(field.name)) return null;
      const required = field.required || resource === resources.reports && fieldValues.report_type === "FIELD" && ["farmer", "farm"].includes(field.name);
      const fieldValuesWithFarmer = fieldValues.farmer_id ? fieldValues : { ...fieldValues, farmer_id: searchParams.get("farmer_id") ?? "" };
      const formField = <FormField field={{ ...field, required }} states={states} lgas={lgas} wards={wards} selectedState={selectedState} selectedLga={selectedLga} fieldValues={fieldValuesWithFarmer} session={session} onFieldValue={(name, value) => setFieldValues((current) => ({ ...current, [name]: value, ...(name === "farmer" ? { farm: "" } : {}) }))} onState={changeState} onLga={changeLga} />;
      return resource === resources.farms && field.name === "farmer_id" && hasPermission(session, "farmer.create")
        ? <div key={field.name}>{formField}<Link href="/farmers/new" className="field-hint mt-2 inline-flex font-semibold text-[#a34e3d] underline">Farmer not listed? Create a new farmer</Link></div>
        : <div key={field.name}>{formField}</div>;
    })}</div>
      {resource === resources.farms && <div className="sm:col-span-2"><FarmBoundaryCapture onBoundary={(boundary) => setFieldValues((current) => ({
        ...current,
        size_hectares: boundary?.sizeHectares ?? "",
        latitude: boundary?.latitude ?? "",
        longitude: boundary?.longitude ?? "",
      }))} /><div className="mt-4"><CurrentLocationCapture onCoordinates={(coordinates) => setFieldValues((current) => ({
        ...current,
        latitude: coordinates.latitude.toFixed(7),
        longitude: coordinates.longitude.toFixed(7),
      }))} /></div></div>}
      {resource === resources.officers && <FieldOfficerRegionPicker onReady={setFieldOfficerRegionsReady} />}
      {resource === resources.farms && session.user.user_type !== "FARMER" && hasPermission(session, "farmer.create") && <Link href="/farmers/new" className="danger-button mt-4 font-bold"><Plus size={14} /> Create a farmer first</Link>}
      {resource === resources.kyc && <p className="mt-4 rounded-lg bg-[#fff8e8] px-3 py-2.5 text-xs leading-5 text-[#7d5b20]">Identity numbers are encrypted by the backend. They are never returned by standard KYC reads.</p>}
      {Boolean(error) && <div className="mt-5"><ErrorPanel error={error} /></div>}
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-5"><Link href={`/${routeForResource(resource)}`} className="secondary-button">Cancel</Link><button disabled={busy || resource === resources.officers && !fieldOfficerRegionsReady} className="primary-button">{busy ? "Saving…" : resource === resources.kyc ? "Create draft and add documents" : "Create record"}<ArrowRight size={14} /></button></div>
    </form>
  </>;
}

function FormField({ field, states, lgas, wards, selectedState, selectedLga, fieldValues, session, onFieldValue, onState, onLga }: { field: Field; states: Row[]; lgas: Row[]; wards: Row[]; selectedState: string; selectedLga: string; fieldValues: Record<string, string>; session: SessionInfo; onFieldValue: (name: string, value: string) => void; onState: (value: string) => void; onLga: (value: string) => void }) {
  const wide = field.wide ? "sm:col-span-2" : "";
  if (field.lookup) return <LookupSelect field={field} session={session} value={fieldValues[field.name] ?? ""} dependencyValue={field.dependsOn ? fieldValues[field.dependsOn] ?? "" : ""} onChange={(value) => onFieldValue(field.name, value)} />;
  if (["state", "lga", "ward"].includes(field.name)) {
    const entries = field.name === "state" ? states : field.name === "lga" ? lgas : wards;
    const disabled = field.name === "lga" ? !selectedState : field.name === "ward" ? !selectedLga : false;
    return <label className={`field-label ${wide}`}>{field.label}<select className="field-control" name={field.name} disabled={disabled} onChange={(event) => field.name === "state" ? onState(event.target.value) : field.name === "lga" ? onLga(event.target.value) : undefined}><option value="">Optional</option>{entries.map((entry) => <option key={String(entry.id)} value={String(entry.id)}>{display(entry.name)}</option>)}</select></label>;
  }
  if (field.options) return <label className={`field-label ${wide}`}>{field.label}<select className="field-control" name={field.name} value={fieldValues[field.name] ?? ""} onChange={(event) => onFieldValue(field.name, event.target.value)} required={field.required}><option value="">Select…</option>{field.options.map((value) => <option key={value}>{value}</option>)}</select>{field.hint && <span className="field-hint">{field.hint}</span>}</label>;
  if (field.type === "textarea") return <label className={`field-label ${wide}`}>{field.label}<textarea className="field-control min-h-[86px] resize-y py-2.5" name={field.name} required={field.required} placeholder={field.placeholder} value={fieldValues[field.name] ?? ""} onChange={(event) => onFieldValue(field.name, event.target.value)} /></label>;
  return <label className={`field-label ${wide}`}>{field.label}<input className="field-control" name={field.name} type={field.type ?? "text"} required={field.required} placeholder={field.placeholder} value={fieldValues[field.name] ?? ""} onChange={(event) => onFieldValue(field.name, event.target.value)} />{field.hint && <span className="field-hint">{field.hint}</span>}</label>;
}

function FieldOfficerRegionPicker({ onReady }: { onReady: (ready: boolean) => void }) {
  const [states, setStates] = useState<Row[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [lgas, setLgas] = useState<Row[]>([]);
  const [selectedLgas, setSelectedLgas] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<Row[]>("geography/states")
      .then((items) => {
        if (!active) return;
        setStates(items);
        const kwara = items.find((item) => String(item.name ?? "").toLowerCase() === "kwara");
        if (kwara) setSelectedState(String(kwara.id));
        else setError("Kwara state was not found in the location data.");
      })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [onReady, retry]);

  useEffect(() => {
    if (!selectedState) return;
    let active = true;
    apiRequest<Row[]>(`geography/states/${selectedState}/lgas`)
      .then((items) => {
        if (!active) return;
        setLgas(items);
        const ids = items.map((item) => String(item.id));
        setSelectedLgas(ids);
        onReady(true);
        setError("");
      })
      .catch((reason: unknown) => { if (active) { setError(errorMessage(reason)); onReady(false); } });
    return () => { active = false; };
  }, [onReady, selectedState, retry]);

  const visibleLgas = lgas.filter((lga) => String(lga.name ?? "").toLowerCase().includes(search.trim().toLowerCase()));
  const allVisibleSelected = visibleLgas.length > 0 && visibleLgas.every((lga) => selectedLgas.includes(String(lga.id)));
  function toggleLga(id: string) {
    setSelectedLgas((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <section className="mt-5 rounded-lg border border-[var(--line)] bg-[#fbfcfa] p-4 sm:col-span-2">
    <div className="eyebrow">Officer coverage</div>
    <h2 className="mt-1 text-sm font-semibold">Select state and local governments</h2>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">All Kwara LGAs are selected by default. Change state, search, or deselect individual LGAs.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <label className="field-label">State<select className="field-control" value={selectedState} onChange={(event) => { onReady(false); setSelectedState(event.target.value); setSelectedLgas([]); setLgas([]); }}><option value="">Select a state…</option>{states.map((state) => <option key={String(state.id)} value={String(state.id)}>{display(state.name)}</option>)}</select></label>
      <label className="field-label">Search local governments<input className="field-control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type an LGA name" /></label>
    </div>
    {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#a34e3d]">{error}<button type="button" className="font-semibold underline" onClick={() => { onReady(false); setRetry((value) => value + 1); }}>Retry</button></div>}
    {selectedState && <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-[var(--line)] bg-white p-3">
      <label className="mb-2 flex items-center gap-2 border-b border-[var(--line)] pb-2 text-xs font-bold text-[var(--ink)]"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedLgas((current) => allVisibleSelected ? current.filter((id) => !visibleLgas.some((lga) => String(lga.id) === id)) : [...new Set([...current, ...visibleLgas.map((lga) => String(lga.id))])])} /> Select all {search ? "matching" : "local governments"}</label>
      {visibleLgas.length === 0 ? <p className="py-3 text-xs text-[var(--muted)]">{lgas.length ? "No local governments match this search." : "No local governments are available."}</p> : <div className="grid gap-2 sm:grid-cols-2">{visibleLgas.map((lga) => <label key={String(lga.id)} className="flex items-center gap-2 text-xs font-medium text-[var(--ink)]"><input type="checkbox" checked={selectedLgas.includes(String(lga.id))} onChange={() => toggleLga(String(lga.id))} />{display(lga.name)}</label>)}</div>}
    </div>}
    <input type="hidden" name="region_lgas" value={JSON.stringify(selectedLgas)} />
    <p className="mt-2 text-[10px] text-[var(--muted)]">{selectedLgas.length} local government{selectedLgas.length === 1 ? "" : "s"} selected.</p>
  </section>;
}

function GeographySelects({ values, onChange }: { values: GeographyValues; onChange: (values: GeographyValues) => void }) {
  const [states, setStates] = useState<Row[]>([]);
  const [lgas, setLgas] = useState<{ parent: string; items: Row[] }>({ parent: "", items: [] });
  const [wards, setWards] = useState<{ parent: string; items: Row[] }>({ parent: "", items: [] });
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<Row[]>("geography/states").then((items) => { if (active) { setStates(items); setError(""); } }).catch(() => { if (active) setError("Could not load locations."); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!values.state) return;
    let active = true;
    apiRequest<Row[]>(`geography/states/${values.state}/lgas`).then((items) => { if (active) { setLgas({ parent: values.state, items }); setError(""); } }).catch(() => { if (active) setError("Could not load LGAs."); });
    return () => { active = false; };
  }, [retry, values.state]);
  useEffect(() => {
    if (!values.lga) return;
    let active = true;
    apiRequest<Row[]>(`geography/lgas/${values.lga}/wards`).then((items) => { if (active) { setWards({ parent: values.lga, items }); setError(""); } }).catch(() => { if (active) setError("Could not load wards."); });
    return () => { active = false; };
  }, [retry, values.lga]);

  const lgaOptions = lgas.parent === values.state ? lgas.items : [];
  const wardOptions = wards.parent === values.lga ? wards.items : [];
  return <>
    <label className="field-label">State<select className="field-control" name="state" value={values.state} onChange={(event) => onChange({ state: event.target.value, lga: "", ward: "" })}><option value="">Any state</option>{states.map((item) => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}</select></label>
    <label className="field-label">LGA<select className="field-control" name="lga" value={values.lga} disabled={!values.state} onChange={(event) => onChange({ ...values, lga: event.target.value, ward: "" })}><option value="">Any LGA</option>{lgaOptions.map((item) => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}</select></label>
    <label className="field-label">Ward<select className="field-control" name="ward" value={values.ward} disabled={!values.lga} onChange={(event) => onChange({ ...values, ward: event.target.value })}><option value="">Any ward</option>{wardOptions.map((item) => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}</select>{error && <button type="button" className="field-hint text-left" onClick={() => setRetry((value) => value + 1)}>{error} Retry</button>}</label>
  </>;
}

const lookupSources: Record<LookupKind, { endpoint: string; permission: string }> = {
  farmers: { endpoint: "farmers/farmers?page=1&page_size=100", permission: "farmer.read" },
  farms: { endpoint: "farms/farms", permission: "farm.read" },
  seasons: { endpoint: "seasons", permission: "season.read" },
  crops: { endpoint: "crops/crops", permission: "crop.read" },
  farmCrops: { endpoint: "farm-crops/farm-crops", permission: "farm_crop.read" },
  staffUsers: { endpoint: "users/users?role=FIELD_OFFICER&page=1&page_size=100", permission: "user.read" },
};

function lookupOptionValue(row: Row, lookup: LookupKind) {
  return lookup === "staffUsers" ? String(row.id ?? "") : recordId(row);
}

function lookupOptionLabel(row: Row, lookup: LookupKind) {
  if (lookup === "farmers") return `${display(row.farmer_number ?? row.provisional_reference ?? "Farmer")} · ${[row.first_name, row.last_name].filter(Boolean).map(String).join(" ") || display(row.email)}`;
  if (lookup === "farms") return `${display(row.farm_number ?? "Farm")} · ${display(row.name)}${row.farmer_name ? ` · ${display(row.farmer_name)}` : ""}`;
  if (lookup === "seasons") return `${display(row.name)}${row.year ? ` · ${display(row.year)}` : ""}`;
  if (lookup === "crops") return display(row.name ?? row.crop_name ?? row.id);
  if (lookup === "farmCrops") return [row.farm_name, row.crop_name, row.season_name ? `${display(row.season_name)}${row.season_year ? ` (${display(row.season_year)})` : ""}` : undefined].map(display).join(" · ");
  return `${[row.first_name, row.last_name].filter(Boolean).map(String).join(" ") || display(row.email)}${row.email ? ` · ${display(row.email)}` : ""}`;
}

function LookupSelect({ field, session, value, dependencyValue, onChange }: { field: Field; session: SessionInfo; value: string; dependencyValue: string; onChange: (value: string) => void }) {
  const [options, setOptions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const lookup = field.lookup!;
  const source = lookupSources[lookup];
  const canRead = hasPermission(session, source.permission);
  const waitingForParent = Boolean(field.dependsOn && !dependencyValue);

  useEffect(() => {
    if (!canRead || waitingForParent) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) { setLoading(true); setError(null); }
      return apiRequest<unknown>(source.endpoint);
    })
      .then((payload) => {
        if (!active) return;
        setOptions(pageData(payload).rows);
      })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canRead, dependencyValue, field.dependsOn, lookup, retry, source.endpoint, waitingForParent]);

  const visibleError = canRead && !waitingForParent ? error : null;
  const visibleLoading = canRead && !waitingForParent && loading;
  const visibleOptions = !canRead || waitingForParent ? [] : lookup === "farms" && field.dependsOn && dependencyValue ? options.filter((row) => {
    const farmer = row.farmer_id ?? row.farmer;
    const farmerId = farmer && typeof farmer === "object" ? recordId(farmer as Row) : String(farmer ?? "");
    return farmerId === dependencyValue;
  }) : options;
  const disabled = !canRead || visibleLoading || waitingForParent || Boolean(visibleError);
  const placeholder = waitingForParent ? "Choose a farmer first" : visibleLoading ? "Loading options…" : visibleError ? "Options unavailable" : `Select ${field.label.toLowerCase()}…`;
  return <label className={`field-label ${field.wide ? "sm:col-span-2" : ""}`}>{field.label}<select className="field-control" name={field.name} value={value} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled}><option value="">{placeholder}</option>{visibleOptions.map((row) => { const optionValue = lookupOptionValue(row, lookup); return optionValue ? <option key={optionValue} value={optionValue}>{lookupOptionLabel(row, lookup)}</option> : null; })}</select>{field.hint && <span className="field-hint">{field.hint}</span>}{!canRead && <span className="field-hint">Your account cannot load these choices.</span>}{Boolean(visibleError) && <span className="flex items-center gap-2 text-[10px] text-[#a34e3d]">Could not load choices.<button type="button" className="font-semibold" onClick={() => setRetry((value) => value + 1)}>Retry</button></span>}{!visibleLoading && !visibleError && canRead && !waitingForParent && visibleOptions.length === 0 && <span className="field-hint">No choices are available.</span>}</label>;
}

function FarmerDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const editableFields: Field[] = [
    { name: "date_of_birth", label: "Date of birth", type: "date" },
    { name: "gender", label: "Gender", options: ["MALE", "FEMALE"] },
    { name: "address", label: "Address", type: "textarea", wide: true },
  ];
  const canAdminUpdate = hasPermission(session, "farmer.admin_update");
  if (canAdminUpdate) editableFields.push(
    { name: "email", label: "Email", type: "email" }, { name: "phone_number", label: "Phone number", type: "tel" },
    { name: "first_name", label: "First name" }, { name: "last_name", label: "Last name" },
    { name: "community", label: "Community" },
  );
  const actions: Action[] = [
    { label: "Submit for verification", permission: "farmer.submit", path: (key) => `farmers/farmers/${key}/submit`, body: () => ({}), states: ["DRAFT", "RETURNED"] },
    { label: "Field officer sign-off", permission: "farmer.signoff", path: (key) => `farmers/farmers/${key}/field-officer-signoff`, body: (reason) => reason ? { notes: reason } : {}, reasonLabel: "Sign-off notes (optional)", states: ["DRAFT", "PENDING_VERIFICATION"], registrationSource: "OFFICER" },
    { label: "Verify farmer", permission: "farmer.verify", path: (key) => `farmers/farmers/${key}/verify`, body: (reason) => reason ? { notes: reason } : {}, reasonLabel: "Verification notes (optional)", states: ["PENDING_VERIFICATION"] },
    { label: "Return for correction", permission: "farmer.return", path: (key) => `farmers/farmers/${key}/return`, body: (reason) => ({ reason }), reasonLabel: "Reason for return", states: ["PENDING_VERIFICATION"] },
    { label: "Reopen rejected farmer", permission: "farmer.return", path: (key) => `farmers/farmers/${key}/return`, body: (reason) => ({ reason }), reasonLabel: "Reason for reopening", states: ["REJECTED"] },
    { label: "Reject farmer", permission: "farmer.reject", path: (key) => `farmers/farmers/${key}/reject`, body: (reason) => ({ reason }), reasonLabel: "Reason for rejection", states: ["PENDING_VERIFICATION"], tone: "danger" },
    { label: "Activate", permission: "farmer.restore", path: (key) => `farmers/farmers/${key}/status/activate`, body: (reason) => ({ reason }), reasonLabel: "Reason for activation", states: ["INACTIVE", "SUSPENDED"] },
    { label: "Deactivate", permission: "farmer.archive", path: (key) => `farmers/farmers/${key}/status/deactivate`, body: (reason) => ({ reason }), reasonLabel: "Reason for deactivation", states: ["ACTIVE", "VERIFIED"] },
    { label: "Suspend", permission: "farmer.suspend", path: (key) => `farmers/farmers/${key}/status/suspend`, body: (reason) => ({ reason }), reasonLabel: "Reason for suspension", states: ["ACTIVE", "VERIFIED"], tone: "danger" },
    { label: "Request archive", permission: "farmer.delete_request", path: (key) => `farmers/farmers/${key}/deletion-requests`, body: (reason) => ({ reason }), reasonLabel: "Archive request reason", states: ["ACTIVE", "VERIFIED", "SUSPENDED"] },
  ];
  return <><RecordDetail id={id} title="Farmer profile" eyebrow="Farmer registry / Profile" endpoint={`farmers/farmers/${id}`} historyPath={`farmers/farmers/${id}/history`} session={session} actions={actions} onToast={onToast} editableFields={editableFields} editPermission="farmer.update" geographyFields={canAdminUpdate} /><FarmerFarms id={id} session={session} /><SignedUploadPanel title="Profile photograph" listPath={`farmers/farmers/${id}/profile-photo`} startPath={`farmers/farmers/${id}/profile-photo`} completePath={(imageId) => `farmers/farmers/${id}/profile-photo/${imageId}/complete`} session={session} permission="farmer.update" accept="image/jpeg,image/png,image/webp" /></>;
}

function FarmerFarms({ id, session }: { id: string; session: SessionInfo }) {
  const [farms, setFarms] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const allowed = hasPermission(session, "farm.read");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    apiRequest<Row[]>(`farms/farms?farmer_id=${encodeURIComponent(id)}`)
      .then((records) => { if (active) setFarms(records); })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, id]);

  if (!allowed) return null;
  return <section className="surface-panel p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Land records</div><h2 className="mt-1 text-sm font-semibold">Farms linked to this farmer</h2></div><Link href={`/farms/new?farmer_id=${encodeURIComponent(id)}`} className="secondary-button"><Plus size={14} /> Add farm</Link></div>
    {loading ? <p className="mt-4 text-xs text-[var(--muted)]">Loading farms…</p> : error ? <div className="mt-4"><ErrorPanel error={error} /></div> : farms.length === 0 ? <p className="mt-4 text-xs text-[var(--muted)]">No farms are linked to this farmer yet.</p> : <div className="mt-4 divide-y divide-[var(--line)]">{farms.map((farm) => <Link key={recordId(farm)} href={`/farms/${recordId(farm)}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-[#f8faf7]"><span><span className="block text-sm font-semibold">{display(farm.name)}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{display(farm.farm_number)}{farm.state_name ? ` · ${display(farm.state_name)}` : ""}</span></span><span className={`status-pill ${statusClass(String(farm.status ?? ""))}`}>{display(farm.status)}</span></Link>)}</div>}
  </section>;
}

function FarmDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const editableFields: Field[] = [
    { name: "name", label: "Farm name" }, { name: "size_hectares", label: "Size in hectares", type: "number" },
    { name: "tenure_type", label: "Tenure", options: ["OWNED", "LEASED", "COMMUNAL", "OTHER"] },
    { name: "cultivation_status", label: "Cultivation", options: ["CULTIVATED", "FALLOW", "PREPARING", "OTHER"] },
  ];
  const actions: Action[] = [
    { label: "Verify farm", permission: "farm.verify", path: (key) => `farms/farms/${key}/verify`, body: () => ({}), states: ["DRAFT", "PENDING_VERIFICATION"] },
    { label: "Activate", permission: "farm.restore", path: (key) => `farms/farms/${key}/status/activate`, body: (reason) => ({ reason }), reasonLabel: "Reason for activation" },
    { label: "Deactivate", permission: "farm.archive", path: (key) => `farms/farms/${key}/status/deactivate`, body: (reason) => ({ reason }), reasonLabel: "Reason for deactivation", tone: "danger" },
    { label: "Suspend", permission: "farm.suspend", path: (key) => `farms/farms/${key}/status/suspend`, body: (reason) => ({ reason }), reasonLabel: "Reason for suspension", tone: "danger" },
  ];
  return <><RecordDetail id={id} title="Farm detail" eyebrow="Land / Farm record" endpoint={`farms/farms/${id}`} historyPath={`farms/farms/${id}/history`} session={session} actions={actions} onToast={onToast} editableFields={editableFields} editPermission="farm.update" /><FarmLocationEditor id={id} session={session} /><SignedUploadPanel title="Farm land images" listPath={`farms/farms/${id}/images`} startPath={`farms/farms/${id}/images`} completePath={(imageId) => `farms/farms/${id}/images/${imageId}/complete`} session={session} permission="farm.update" accept="image/jpeg,image/png,image/webp" multiple /></>;
}

function getCurrentCoordinates(): Promise<FarmCoordinate> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location services are unavailable. Use HTTPS or localhost, allow browser location access, and try again."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (reason) => {
        const message = reason.code === reason.PERMISSION_DENIED
          ? "Location access is blocked. Choose Allow in your browser's location prompt. If you previously blocked it, open this site's browser permissions, change Location to Allow, then try again."
          : reason.code === reason.POSITION_UNAVAILABLE
            ? "Your current location could not be determined. Move to an area with a clearer GPS signal and try again."
            : "Finding your location timed out. Try again when GPS reception is better.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });
}

function CurrentLocationCapture({ onCoordinates }: { onCoordinates: (coordinates: FarmCoordinate) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function capture() {
    setBusy(true);
    setError("");
    try {
      onCoordinates(await getCurrentCoordinates());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return <div className="rounded-lg border border-[var(--line)] bg-[#f8faf7] p-3">
    <button type="button" className="secondary-button" disabled={busy} onClick={() => void capture()}><MapPin size={14} />{busy ? "Waiting for browser permission…" : "Share my current location"}</button>
    <p className="mt-2 text-[10px] leading-4 text-[var(--muted)]">Select this button to open your browser&apos;s location permission prompt, then choose Allow. You can also enter coordinates manually.</p>
    {error && <p role="alert" className="mt-2 text-[10px] leading-4 text-[#a34e3d]">{error}</p>}
  </div>;
}

function calculateFarmBoundary(points: FarmCoordinate[]) {
  if (points.length < 3) return null;
  const earthRadius = 6371008.8;
  const radians = Math.PI / 180;
  const meanLatitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const longitudeScale = Math.cos(meanLatitude * radians);
  if (Math.abs(longitudeScale) < 1e-8) return null;
  const projected = points.map((point) => ({
    x: earthRadius * point.longitude * radians * longitudeScale,
    y: earthRadius * point.latitude * radians,
  }));
  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  projected.forEach((point, index) => {
    const next = projected[(index + 1) % projected.length];
    const cross = point.x * next.y - next.x * point.y;
    twiceArea += cross;
    centroidX += (point.x + next.x) * cross;
    centroidY += (point.y + next.y) * cross;
  });
  if (Math.abs(twiceArea) < 1) return null;
  return {
    sizeHectares: (Math.abs(twiceArea) / 2 / 10000).toFixed(3),
    latitude: (centroidY / (3 * twiceArea) / earthRadius / radians).toFixed(7),
    longitude: (centroidX / (3 * twiceArea) / earthRadius / longitudeScale / radians).toFixed(7),
  };
}

function FarmBoundaryCapture({ onBoundary }: { onBoundary: (boundary: { sizeHectares: string; latitude: string; longitude: string } | null) => void }) {
  const [points, setPoints] = useState<FarmCoordinate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const boundary = calculateFarmBoundary(points);
  const previewPoints = points.map((point) => ({
    x: point.longitude,
    y: point.latitude,
  }));
  const minX = previewPoints.length ? Math.min(...previewPoints.map((point) => point.x)) : 0;
  const maxX = previewPoints.length ? Math.max(...previewPoints.map((point) => point.x)) : 0;
  const minY = previewPoints.length ? Math.min(...previewPoints.map((point) => point.y)) : 0;
  const maxY = previewPoints.length ? Math.max(...previewPoints.map((point) => point.y)) : 0;
  const pointString = previewPoints.map((point) => {
    const x = 24 + ((point.x - minX) / (maxX - minX || 1)) * 272;
    const y = 24 + ((maxY - point.y) / (maxY - minY || 1)) * 132;
    return `${x},${y}`;
  }).join(" ");

  async function addBoundaryPoint() {
    setBusy(true);
    setError("");
    try {
      const nextPoints = [...points, await getCurrentCoordinates()];
      const nextBoundary = calculateFarmBoundary(nextPoints);
      setPoints(nextPoints);
      onBoundary(nextBoundary);
      if (nextPoints.length >= 3 && !nextBoundary) setError("Those points do not form a measurable area. Check that you recorded each corner once and in order.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function undoPoint() {
    const nextPoints = points.slice(0, -1);
    setPoints(nextPoints);
    onBoundary(calculateFarmBoundary(nextPoints));
    setError("");
  }

  function clearPoints() {
    setPoints([]);
    onBoundary(null);
    setError("");
  }

  return <section className="rounded-lg border border-[#dce8dd] bg-white p-4">
    <div className="eyebrow">Optional GPS tool</div>
    <h2 className="mt-1 text-sm font-semibold">Measure the farm boundary</h2>
    <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Walk to each corner of the farm in order. Pause at a corner and record its GPS point; return to your starting corner after recording at least three points.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="primary-button" disabled={busy} onClick={() => void addBoundaryPoint()}><MapPin size={14} />{busy ? "Waiting for browser permission…" : `Allow location and record corner ${points.length + 1}`}</button>
      <button type="button" className="secondary-button" disabled={busy || points.length === 0} onClick={undoPoint}><RotateCcw size={13} />Undo last point</button>
      <button type="button" className="secondary-button" disabled={busy || points.length === 0} onClick={clearPoints}>Clear boundary</button>
    </div>
    {points.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
      <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[#f8faf7]">
        <svg viewBox="0 0 320 180" role="img" aria-label={`Farm boundary preview with ${points.length} recorded GPS points`} className="h-36 w-full">
          {points.length >= 3 && <polygon points={pointString} fill="rgba(63,136,97,0.15)" stroke="#3f8861" strokeWidth="2" />}
          {points.length > 1 && <polyline points={pointString} fill="none" stroke="#3f8861" strokeWidth="2" strokeDasharray={points.length >= 3 ? undefined : "5 4"} />}
          {points.map((point, index) => {
            const [x, y] = pointString.split(" ")[index].split(",");
            return <g key={`${point.latitude}-${point.longitude}-${index}`}><circle cx={x} cy={y} r="5" fill={index === 0 ? "#d66b52" : "#153b2c"} /><text x={Number(x) + 7} y={Number(y) - 6} fontSize="9" fill="#344b3d">{index + 1}</text></g>;
          })}
        </svg>
      </div>
      <div className="flex flex-col justify-center gap-2 text-[11px]">
        <span className="font-semibold">{points.length} corner{points.length === 1 ? "" : "s"} recorded</span>
        {boundary ? <><span>Estimated area: <strong>{boundary.sizeHectares} ha</strong></span><span>Farm centre: {boundary.latitude}, {boundary.longitude}</span></> : <span className="text-[var(--muted)]">Record at least three non-collinear corners to calculate area.</span>}
      </div>
    </div>}
    <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">The estimate uses the points in the order recorded. GPS accuracy varies; the boundary points are not saved by the server, only the resulting area and centre coordinates.</p>
    {error && <p role="alert" className="mt-2 text-[10px] leading-4 text-[#a34e3d]">{error}</p>}
  </section>;
}

function FarmLocationEditor({ id, session }: { id: string; session: SessionInfo }) {
  const [opened, setOpened] = useState(false);
  const [location, setLocation] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [states, setStates] = useState<Row[]>([]);
  const [lgas, setLgas] = useState<Row[]>([]);
  const [wards, setWards] = useState<Row[]>([]);
  const [coordinates, setCoordinates] = useState({ latitude: "", longitude: "" });
  const [geographySelection, setGeographySelection] = useState<GeographyValues | null>(null);
  const selectedState = geographySelection?.state ?? String(location?.state_id ?? "");
  const selectedLga = geographySelection?.lga ?? String(location?.lga_id ?? "");
  const selectedWard = geographySelection?.ward ?? String(location?.ward_id ?? "");
  useEffect(() => {
    if (!opened || location) return;
    let active = true;
    Promise.resolve().then(() => { if (active) setLoading(true); return apiRequest<Row>(`farms/farms/${id}/location`); })
      .then((value) => {
        if (!active) return;
        setLocation(value);
        setCoordinates({ latitude: String(value.latitude ?? ""), longitude: String(value.longitude ?? "") });
      })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, location, opened]);
  useEffect(() => { if (opened) apiRequest<Row[]>("geography/states").then(setStates).catch((reason: unknown) => setError(reason)); }, [opened]);
  useEffect(() => {
    if (!selectedState) return;
    let active = true;
    apiRequest<Row[]>(`geography/states/${selectedState}/lgas`).then((items) => { if (active) setLgas(items); }).catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [selectedState]);
  useEffect(() => {
    if (!selectedLga) return;
    let active = true;
    apiRequest<Row[]>(`geography/lgas/${selectedLga}/wards`).then((items) => { if (active) setWards(items); }).catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [selectedLga]);

  function setSelectedState(value: string) {
    setGeographySelection({ state: value, lga: "", ward: "" });
    setLgas([]);
    setWards([]);
  }

  function setSelectedLga(value: string) {
    setGeographySelection((current) => ({ state: current?.state ?? String(location?.state_id ?? ""), lga: value, ward: "" }));
    setWards([]);
  }

  function setSelectedWard(value: string) {
    setGeographySelection((current) => ({ state: current?.state ?? String(location?.state_id ?? ""), lga: current?.lga ?? String(location?.lga_id ?? ""), ward: value }));
  }
  if (!hasPermission(session, "farm.read")) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage("");
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== "")) as Row;
    values.state = String(form.get("state") ?? "") || null;
    values.lga = String(form.get("lga") ?? "") || null;
    values.ward = String(form.get("ward") ?? "") || null;
    if ((values.latitude && !values.longitude) || (!values.latitude && values.longitude)) { setError("Enter both coordinates or leave both blank."); setBusy(false); return; }
    const latitude = Number(values.latitude); const longitude = Number(values.longitude);
    if (values.latitude && (latitude < -90 || latitude > 90)) { setError("Latitude must be between -90 and 90."); setBusy(false); return; }
    if (values.longitude && (longitude < -180 || longitude > 180)) { setError("Longitude must be between -180 and 180."); setBusy(false); return; }
    try {
      const saved = await apiRequest<Row>(`farms/farms/${id}/location`, { method: "PATCH", body: values });
      setLocation(saved);
      setCoordinates({ latitude: String(saved.latitude ?? ""), longitude: String(saved.longitude ?? "") });
      setGeographySelection(null);
      setLgas([]);
      setWards([]);
      setMessage("Location saved.");
    }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  return <section className="surface-panel mt-5 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Farm location</div><h2 className="mt-1 text-sm font-semibold">Address and coordinates</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Location is saved separately. GPS coordinates are optional and depend on browser permission and device accuracy.</p></div>{!opened && <button className="secondary-button" onClick={() => setOpened(true)}>Open location</button>}</div>
    {opened && (loading ? <div className="mt-5"><LoadingState label="Loading farm location" /></div> : location && <form onSubmit={save} className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2"><label className="field-label sm:col-span-2">Address<input className="field-control" name="address" defaultValue={String(location.address ?? "")} /></label><label className="field-label">State<select className="field-control" name="state" value={selectedState} onChange={(event) => { setSelectedState(event.target.value); setSelectedLga(""); setSelectedWard(""); }}><option value="">Select state</option>{states.map((item) => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}</select></label><label className="field-label">LGA<select className="field-control" name="lga" value={selectedLga} disabled={!selectedState} onChange={(event) => { setSelectedLga(event.target.value); setSelectedWard(""); }}><option value="">Select LGA</option>{lgas.map((item) => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}</select></label><label className="field-label">Ward<select className="field-control" name="ward" value={selectedWard} disabled={!selectedLga} onChange={(event) => setSelectedWard(event.target.value)}><option value="">Select ward</option>{wards.map((item) => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}</select></label><div className="sm:col-span-2">{hasPermission(session, "farm.update") && <CurrentLocationCapture onCoordinates={(value) => setCoordinates({ latitude: value.latitude.toFixed(7), longitude: value.longitude.toFixed(7) })} />}</div>{["community", "latitude", "longitude"].map((field) => <label key={field} className="field-label">{field.replaceAll("_", " ")}<input className="field-control" name={field} type={field === "latitude" || field === "longitude" ? "number" : "text"} step={field === "latitude" || field === "longitude" ? "any" : undefined} value={field === "latitude" || field === "longitude" ? coordinates[field] : String(location[field] ?? "")} onChange={(event) => field === "latitude" || field === "longitude" ? setCoordinates((current) => ({ ...current, [field]: event.target.value })) : undefined} /></label>)}{Boolean(error) && <div className="sm:col-span-2"><ErrorPanel error={error} /></div>}{message && <p className="text-xs text-[#3e8057] sm:col-span-2">{message}</p>}<div className="flex justify-end sm:col-span-2">{hasPermission(session, "farm.update") && <button disabled={busy} className="primary-button">{busy ? "Saving…" : "Save location"}</button>}</div></form>)}
    {Boolean(error) && !location && <div className="mt-4"><ErrorPanel error={error} /></div>}
  </section>;
}

function SignedUploadPanel({ title, listPath, startPath, completePath, session, permission, accept, multiple = false }: { title: string; listPath: string; startPath: string; completePath: (imageId: string) => string; session: SessionInfo; permission: string; accept: string; multiple?: boolean }) {
  const [files, setFiles] = useState<Row[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const isAccountPhoto = listPath === "auth/me/profile-photo";
  const canRead = hasPermission(session, isAccountPhoto ? "auth.return" : title === "Profile photograph" ? "farmer.read" : "farm.read");
  const canUpload = hasPermission(session, permission);

  async function loadFiles() {
    setLoading(true); setError(null);
    try { const result = await apiRequest<unknown>(listPath); setFiles(uploadRecords(result)); setLoaded(true); }
    catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    apiRequest<unknown>(listPath)
      .then((result) => {
        if (!active) return;
        const list = uploadRecords(result);
        setFiles(list);
        setLoaded(true);
      })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canRead, listPath]);

  async function upload() {
    if (!selectedFiles.length || !canUpload) return;
    setBusy(true); setError(null); setMessage("");
    try {
      for (const file of selectedFiles) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} exceeds the 10 MiB image limit.`);
        const mimeType = imageMimeType(file);
        const bytes = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const started = await apiRequest<Row>(startPath, { method: "POST", body: { file_name: file.name, mime_type: mimeType, file_size: file.size, checksum } });
        const image = started.image && typeof started.image === "object" ? started.image as Row : started.photo && typeof started.photo === "object" ? started.photo as Row : started;
        const imageId = String(image.id ?? "");
        const uploadUrl = String(started.upload_url ?? "");
        if (!imageId || !uploadUrl) throw new Error("The API did not return an upload reference.");
        const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType, "x-amz-meta-sha256": checksum }, body: bytes });
        if (!response.ok) { const detail = await response.text().catch(() => ""); throw new Error(`Storage upload failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}. The upload was not confirmed.`); }
        await apiRequest(completePath(imageId), { method: "POST", body: {} });
      }
      setSelectedFiles([]); setMessage("Upload confirmed by the server."); await loadFiles();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  if (!canRead && !canUpload) return null;
  return <section className="surface-panel mt-5 p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><div className="eyebrow">Private storage</div><h2 className="mt-1 text-sm font-semibold">{title}</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Files are saved only after storage upload and API confirmation both succeed. Signed URLs are never retained.</p></div><Upload size={17} className="text-[var(--leaf)]" /></div>
    {canRead && <div className="mt-4">{loading ? <p className="text-xs text-[var(--muted)]">Loading confirmed files…</p> : loaded && files.length === 0 ? <p className="text-xs text-[var(--muted)]">No confirmed files yet.</p> : files.map((file, index) => <div key={String(file.id ?? index)} className="flex items-center gap-3 border-b border-[var(--line)] py-2 text-xs">{title === "Profile photograph" && file.download_url ? <Image src={String(file.download_url)} alt="Current profile" width={56} height={56} unoptimized className="h-14 w-14 rounded-full object-cover" /> : null}<span className="min-w-0 flex-1 truncate">{display(file.file_name ?? file.name ?? file.id)}</span><span className="text-[var(--muted)]">{display(file.status ?? file.upload_confirmed_at ?? "Confirmed")}</span></div>)}</div>}
    {canUpload && <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-4"><label className="field-label min-w-[220px] flex-1">{multiple ? "Image files" : "Image file"}<input className="field-control !h-auto !py-2" type="file" accept={accept} multiple={multiple} onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} /></label><button onClick={() => void upload()} disabled={busy || selectedFiles.length === 0} className="primary-button">{busy ? "Uploading…" : "Upload and confirm"}</button></div>}
    {message && <p role="status" className="mt-3 text-xs text-[#3e8057]">{message}</p>}{Boolean(error) && <div className="mt-3"><ErrorPanel error={error} onRetry={() => void loadFiles()} /></div>}
  </section>;
}

function uploadRecords(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Row;
  if (Array.isArray(record.images)) return record.images as Row[];
  if (Array.isArray(record.photos)) return record.photos as Row[];
  if (record.photo && typeof record.photo === "object") return [record.photo as Row];
  return [];
}

function imageMimeType(file: File) {
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const type = extension ? types[extension] : undefined;
  if (!type) throw new Error("Choose a JPEG, PNG, or WebP image.");
  return type;
}

function AccountProfilePage({ session }: { session: SessionInfo }) {
  const user = session.user;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
  const details = [
    ["Full name", name], ["Email address", user.email], ["Phone number", user.phone_number || "Not provided"],
    ["Account type", display(user.user_type)], ["Phone verification", user.is_verified ? "Verified" : "Not verified"],
    ["Email verification", user.is_email_verified ? "Verified" : "Not verified"],
    ["Member since", user.created_at ? new Intl.DateTimeFormat("en-NG", { dateStyle: "long" }).format(new Date(user.created_at)) : "—"],
  ];
  return <><div className="mb-7"><div className="eyebrow">Account / Personal details</div><h1 className="mt-2 text-[27px] font-semibold text-[var(--ink)] sm:text-[30px]">My profile</h1></div><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]"><section className="surface-panel p-5 sm:p-6"><div className="eyebrow">Profile details</div><dl className="mt-4 divide-y divide-[var(--line)]">{details.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="break-words text-sm font-medium text-[var(--ink)]">{value}</dd></div>)}</dl></section><SignedUploadPanel title="Profile photograph" listPath="auth/me/profile-photo" startPath="auth/me/profile-photo" completePath={(photoId) => `auth/me/profile-photo/${photoId}/complete`} session={session} permission="auth.return" accept="image/jpeg,image/png,image/webp" /></div></>;
}

function VisitDetail({ id, session }: { id: string; session: SessionInfo }) {
  const fields: Field[] = [{ name: "visit_at", label: "Visit date and time", type: "datetime-local" }, { name: "purpose", label: "Purpose" }, { name: "notes", label: "Notes", type: "textarea", wide: true }, { name: "latitude", label: "Latitude", type: "number" }, { name: "longitude", label: "Longitude", type: "number" }];
  return <RecordDetail id={id} title="Field visit" eyebrow="Field operations / Visit" endpoint={`field-visits/${id}`} historyPath={`field-visits/${id}/history`} session={session} editableFields={fields} editPermission="field_visit.update" />;
}

function ReportDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const editableFields: Field[] = [{ name: "purpose", label: "Purpose" }, { name: "topic", label: "Topic" }, { name: "summary", label: "Summary", type: "textarea", wide: true }, { name: "activities", label: "Activities", type: "textarea", wide: true }, { name: "observations", label: "Observations", type: "textarea", wide: true }, { name: "crop_condition", label: "Crop condition", type: "textarea" }, { name: "progress", label: "Progress", type: "textarea" }, { name: "challenges", label: "Challenges", type: "textarea" }, { name: "recommendations", label: "Recommendations", type: "textarea" }, { name: "next_action", label: "Next action", type: "textarea" }];
  const actions: Action[] = [
    { label: "Submit report", permission: "field_report.submit", path: (key) => `field-reports/${key}/submit`, body: () => ({}), states: ["DRAFT", "RETURNED"] },
    { label: "Review report", permission: "field_report.review", path: (key) => `field-reports/${key}/review`, body: () => ({}), states: ["SUBMITTED"] },
    { label: "Approve report", permission: "field_report.approve", path: (key) => `field-reports/${key}/approve`, body: () => ({}), states: ["SUBMITTED", "REVIEWED"] },
    { label: "Return report", permission: "field_report.return", path: (key) => `field-reports/${key}/return`, body: () => ({}), states: ["SUBMITTED", "REVIEWED"] },
    { label: "Reject report", permission: "field_report.reject", path: (key) => `field-reports/${key}/reject`, body: () => ({}), states: ["SUBMITTED", "REVIEWED"], tone: "danger" },
    { label: "Archive report", permission: "field_report.archive", path: (key) => `field-reports/${key}/archive`, body: () => ({}), states: ["APPROVED", "REJECTED"] },
  ];
  return <><RecordDetail id={id} title="Field report" eyebrow="Field operations / Report" endpoint={`field-reports/${id}`} historyPath={`field-reports/${id}/history`} session={session} actions={actions} onToast={onToast} editableFields={editableFields} editPermission="field_report.update" editStates={["DRAFT", "RETURNED"]} /><FieldReportMediaPanel id={id} session={session} onToast={onToast} /></>;
}

function FieldReportMediaPanel({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const [media, setMedia] = useState<Row[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [mediaType, setMediaType] = useState("PHOTO");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const canRead = hasPermission(session, "field_report_media.read");
  const canCreate = hasPermission(session, "field_report_media.create");
  useEffect(() => { if (!canRead) return; let active = true; apiRequest<Row[]>(`field-reports/${id}/media`).then((items) => { if (active) setMedia(items); }).catch((reason: unknown) => { if (active) setError(reason); }); return () => { active = false; }; }, [canRead, id, refresh]);
  async function attach(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); try { await apiRequest(`field-reports/${id}/media`, { method: "POST", body: { document: documentId, media_type: mediaType } }); setDocumentId(""); setRefresh((value) => value + 1); onToast("Confirmed document attached to the report."); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  async function remove(mediaId: string) { try { await apiRequest(`field-report-media/${mediaId}`, { method: "DELETE" }); setRefresh((value) => value + 1); onToast("Report media removed."); } catch (reason) { setError(reason); } }
  return <section className="surface-panel p-5 sm:p-6"><div className="eyebrow">Evidence / Existing documents</div><h2 className="mt-1 text-sm font-semibold">Report media</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Attach an already confirmed document. File bytes are uploaded through the separate document flow.</p>{canRead && media.map((item, index) => { const mediaId = String(item.id ?? ""); return <div key={mediaId || index} className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-3 text-xs"><span>{display(item.document_name ?? item.file_name ?? item.document ?? mediaId)} · {display(item.media_type)}</span>{hasPermission(session, "field_report_media.delete") && <button className="text-[10px] font-semibold text-[#a34e3d]" onClick={() => void remove(mediaId)}>Remove</button>}</div>; })}{canCreate && <form onSubmit={attach} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><label className="field-label">Confirmed document UUID<input className="field-control" value={documentId} onChange={(event) => setDocumentId(event.target.value)} required /></label><label className="field-label">Media type<select className="field-control" value={mediaType} onChange={(event) => setMediaType(event.target.value)}><option>PHOTO</option><option>DOCUMENT</option><option>VIDEO</option></select></label><button className="primary-button self-end" disabled={busy}>{busy ? "Attaching…" : "Attach"}</button></form>}{Boolean(error) && <div className="mt-4"><ErrorPanel error={error} /></div>}</section>;
}

function KycDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const editableFields: Field[] = [{ name: "id_type", label: "Identity type", options: ["NIN", "BVN", "VOTER_CARD", "DRIVERS_LICENSE", "PASSPORT", "OTHER"] }, { name: "verification_method", label: "Verification method", options: ["MANUAL", "API", "OTHER"] }, { name: "id_number", label: "New identity number", hint: "This value is write-only. Leave blank if it does not need replacing." }];
  const actions: Action[] = [
    { label: "Submit KYC", permission: "kyc.submit", path: (key) => `kyc/records/${key}/submit`, body: () => ({}), states: ["DRAFT", "RETURNED"] },
    { label: "Verify KYC", permission: "kyc.verify", path: (key) => `kyc/records/${key}/verify`, body: (reason) => reason ? { reason } : {}, reasonLabel: "Reviewer note (optional)", states: ["SUBMITTED"] },
    { label: "Return for correction", permission: "kyc.return", path: (key) => `kyc/records/${key}/return`, body: (reason) => ({ reason }), reasonLabel: "Reason for return", states: ["SUBMITTED"] },
    { label: "Reject KYC", permission: "kyc.reject", path: (key) => `kyc/records/${key}/reject`, body: (reason) => ({ reason }), reasonLabel: "Reason for rejection", states: ["SUBMITTED"], tone: "danger" },
  ];
  return <RecordDetail id={id} title="KYC record" eyebrow="Verification / KYC" endpoint={`kyc/records/${id}`} historyPath={`kyc/records/${id}/history`} session={session} actions={actions} onToast={onToast} kyc editableFields={editableFields} editPermission="kyc.update" editStates={["DRAFT", "RETURNED"]} />;
}

function RecordDetail({ id, title, eyebrow, endpoint, historyPath, session, actions = [], onToast, kyc = false, editableFields = [], editPermission, editStates, geographyFields = false }: { id: string; title: string; eyebrow: string; endpoint: string; historyPath?: string; session: SessionInfo; actions?: Action[]; onToast?: (message: string) => void; kyc?: boolean; editableFields?: Field[]; editPermission?: string; editStates?: string[]; geographyFields?: boolean }) {
  const router = useRouter();
  const [record, setRecord] = useState<Row | null>(null);
  const [history, setHistory] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [maskedId, setMaskedId] = useState("");
  const [rawId, setRawId] = useState("");
  const [sensitiveBusy, setSensitiveBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);
  const [geography, setGeography] = useState<GeographyValues>({ state: "", lga: "", ward: "" });

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
      return Promise.all([apiRequest<Row>(endpoint), historyPath ? apiRequest<unknown>(historyPath).catch(() => null) : Promise.resolve(null)] as const);
    })
      .then(([data, events]) => { if (active) { setRecord(data); setHistory(events); setGeography({ state: String(data.state_id ?? ""), lga: String(data.lga_id ?? ""), ward: String(data.ward_id ?? "") }); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint, historyPath, refresh]);

  async function runAction(reason: string) {
    if (!pendingAction) return;
    setActionBusy(true);
    setActionError(null);
    try { await apiRequest(pendingAction.path(id), { method: pendingAction.method ?? "POST", body: pendingAction.method === "DELETE" ? undefined : pendingAction.body?.(reason) ?? {} }); setPendingAction(null); onToast?.("Action confirmed by the server."); router.push(backHref(eyebrow)); }
    catch (reasonValue) { setActionError(reasonValue); }
    finally { setActionBusy(false); }
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditBusy(true);
    setEditError(null);
    const body = Object.fromEntries([...new FormData(event.currentTarget).entries()].filter(([, value]) => String(value).trim() !== "")) as Row;
    for (const field of ["active", "is_required_for_kyc"]) if (body[field] !== undefined) body[field] = body[field] === "true";
    if (endpoint.startsWith("users/users/") && ("email" in body || "phone_number" in body) && !window.confirm("Changing email or phone number clears that contact's verification status. Continue?")) {
      setEditBusy(false);
      return;
    }
    try {
      await apiRequest(endpoint, { method: "PATCH", body });
      setEditing(false);
      setRefresh((value) => value + 1);
      onToast?.("Changes saved from the server response.");
      router.push(backHref(eyebrow));
    } catch (reason) { setEditError(reason); }
    finally { setEditBusy(false); }
  }

  async function downloadDocument(documentId: string) {
    try { const result = await apiRequest<{ url?: string; download_url?: string }>(`documents/documents/${documentId}/download-url`); const url = result.url ?? result.download_url; if (url) window.open(url, "_blank", "noopener,noreferrer"); }
    catch (reason) { setError(reason); }
  }

  async function detachKycDocument(documentId: string) {
    if (!window.confirm("Remove this document from the KYC record? The document itself will remain in the library.")) return;
    try { await apiRequest(`kyc/records/${id}/documents/${documentId}`, { method: "DELETE" }); setRefresh((value) => value + 1); onToast?.("Document detached from KYC."); }
    catch (reason) { setError(reason); }
  }

  async function loadIdentifier(raw: boolean) {
    setSensitiveBusy(true);
    try { const result = await apiRequest<{ masked_id_number?: string; id_number?: string }>(`kyc/records/${id}/identifier${raw ? "/raw" : ""}`); if (raw) setRawId(result.id_number ?? ""); else setMaskedId(result.masked_id_number ?? ""); }
    catch (reason) { setError(reason); }
    finally { setSensitiveBusy(false); }
  }

  if (loading) return <LoadingState label={`Loading ${title.toLowerCase()}`} />;
  if (error || !record) return <><Link href={backHref(eyebrow)} className="back-link"><ArrowLeft size={14} /> Back</Link><ErrorPanel error={error ?? "Record unavailable."} onRetry={() => setRefresh((value) => value + 1)} /></>;

  const currentStatus = String(record.status ?? (record.is_active === true ? "ACTIVE" : record.is_active === false ? "INACTIVE" : ""));
  const ownerSummary = record.owner_summary && typeof record.owner_summary === "object" ? record.owner_summary as Row : {};
  const kycOwnerId = String(record.user ?? ownerSummary.user_id ?? "");
  const makerId = String(record.created_by_id ?? record.created_by ?? record.officer_user_id ?? record.officer_user ?? "");
  const isOwnKyc = kyc && kycOwnerId === session.user.id;
  const isOwnReport = endpoint.startsWith("field-reports/") && makerId === session.user.id;
  const availableActions = actions.filter((action) => hasPermission(session, action.permission) && !(endpoint.startsWith("farmers/farmers/") && hasRole(session, "FIELD_OFFICER") && action.label === "Activate") && (!action.states || action.states.includes(currentStatus)) && (!action.registrationSource || record.registration_source === action.registrationSource) && !(isOwnKyc && ["kyc.verify", "kyc.return", "kyc.reject"].includes(action.permission)) && !(isOwnReport && ["field_report.review", "field_report.approve"].includes(action.permission)));
  const canEdit = editableFields.length > 0 && hasPermission(session, editPermission) && (!editStates || editStates.includes(currentStatus));
  const fields = Object.entries(record).filter(([key, value]) => (key === "region_lgas" && Array.isArray(value)) || (key !== "id" && key !== "field_officer_signed_by" && !key.endsWith("_id") && !(typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) && !["documents", "history", "events", "metadata"].includes(key) && !key.toLowerCase().includes("url") && (value === null || typeof value !== "object")));
  const documents = Array.isArray(record.documents) ? record.documents as Row[] : [];
  const events = history && typeof history === "object" && "events" in history ? (history as { events: Row[] }).events : [];

  return <><Link href={backHref(eyebrow)} className="back-link"><ArrowLeft size={14} /> Back to records</Link>{heading(title, eyebrow)}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-5">
      <section className="surface-panel p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-4"><div><div className="mono text-[10px] text-[var(--muted)]">{id}</div><h2 className="mt-1 text-lg font-semibold">{display(record.name ?? record.first_name ?? record.report_reference ?? record.file_name ?? record.email ?? title)}</h2></div><div className="flex items-center gap-2">{Boolean(record.status) && <span className={`status-pill ${statusClass(currentStatus)}`}>{currentStatus.replaceAll("_", " ")}</span>}{canEdit && <button className="secondary-button !min-h-8" onClick={() => { setEditError(null); setEditing((value) => !value); }}>{editing ? "Close editor" : "Edit details"}</button>}</div></div>
        {endpoint.startsWith("farmers/farmers/") && <div className="mt-4 flex flex-wrap gap-2"><span className={`status-pill ${record.account_active ? "status-good" : "status-bad"}`}>Account {record.account_active ? "active" : "inactive"}</span><span className={`status-pill ${record.farmer_verified ? "status-good" : "status-wait"}`}>Farmer {record.farmer_verified ? "verified" : "not verified"}</span></div>}
        <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">{fields.filter(([key]) => !(endpoint.startsWith("farmers/farmers/") && ["account_active", "farmer_verified"].includes(key)) && !(endpoint.startsWith("farm-crops/farm-crops/") && ["farm", "crop", "season"].includes(key))).map(([key, value]) => { const empty = value === null || value === ""; return <div key={key} className="min-w-0"><dt className="detail-label">{key.replaceAll("_", " ")}</dt><dd className={`detail-value ${empty ? "detail-value-empty" : ""}`}>{empty ? "Not provided" : display(value)}</dd></div>; })}</dl>
        {editing && canEdit && <form onSubmit={saveRecord} className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
          {editableFields.map((field) => <label key={field.name} className={`field-label ${field.wide ? "sm:col-span-2" : ""}`}>{field.label}{field.options ? <select className="field-control" name={field.name} defaultValue={String(record[field.name] ?? "")}><option value="">Select…</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === "textarea" ? <textarea className="field-control min-h-[80px] py-2.5" name={field.name} defaultValue={String(record[field.name] ?? "")} /> : <input className="field-control" name={field.name} type={field.type ?? "text"} defaultValue={String(record[field.name] ?? "")} />}</label>)}
          {geographyFields && <GeographySelects values={geography} onChange={setGeography} />}
          {Boolean(editError) && <div className="sm:col-span-2"><ErrorPanel error={editError} /></div>}
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button disabled={editBusy} className="primary-button">{editBusy ? "Saving…" : "Save changes"}</button></div>
        </form>}
        {endpoint.startsWith("documents/documents/") && hasPermission(session, "document.read") && <div className="mt-5 border-t border-[var(--line)] pt-4"><button className="secondary-button" onClick={() => void downloadDocument(id)}><Download size={14} /> Download document</button></div>}
        {kyc && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">{hasPermission(session, "kyc.read_sensitive") && <button className="secondary-button" disabled={sensitiveBusy} onClick={() => void loadIdentifier(false)}>{sensitiveBusy ? "Loading…" : "Reveal masked ID"}</button>}{hasPermission(session, "kyc.read") && hasPermission(session, "kyc.read_identifier") && <button className="danger-button" disabled={sensitiveBusy} onClick={() => { if (window.confirm("This audited action reveals the raw identity number. Continue?")) void loadIdentifier(true); }}>Read raw ID</button>}{maskedId && <span className="mono rounded-md bg-[#edf3ee] px-2.5 py-2 text-xs">{maskedId}</span>}{rawId && <span className="mono rounded-md bg-[#fff3f0] px-2.5 py-2 text-xs">{rawId}</span>}</div>}
        {documents.length > 0 && <div className="mt-6 border-t border-[var(--line)] pt-5"><h3 className="text-sm font-semibold">Supporting documents</h3><div className="mt-3 divide-y divide-[var(--line)]">{documents.map((doc, index) => { const docId = String(doc.id ?? doc.document_id ?? ""); return <div key={docId || index} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><div className="truncate text-xs font-medium">{display(doc.file_name ?? doc.document_type_name ?? docId)}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{display(doc.mime_type)} · {display(doc.status)} · {display(doc.malware_status)}</div></div><div className="flex items-center gap-2"><button className="icon-button" title="Open document" aria-label="Open document" onClick={() => void downloadDocument(docId)}><Download size={15} /></button>{kyc && canEdit && <button className="text-[10px] font-semibold text-[#a34e3d]" onClick={() => void detachKycDocument(docId)}>Detach</button>}</div></div>; })}</div></div>}
      </section>
      {kyc && ["DRAFT", "RETURNED"].includes(currentStatus) && <KycDocuments recordId={id} recordDocuments={documents} session={session} onComplete={() => setRefresh((value) => value + 1)} />}
      {historyPath && <HistoryPanel history={history} events={events} />}
    </div><aside className="space-y-5">{availableActions.length > 0 && <section className="surface-panel p-5"><div className="eyebrow">Available actions</div><div className="mt-3 space-y-2">{availableActions.map((action) => <button key={action.label} onClick={() => { setActionError(null); setPendingAction(action); }} className={action.tone ? "danger-button w-full justify-between" : "secondary-button w-full justify-between"}>{action.label}<ArrowRight size={14} /></button>)}</div></section>}{kyc && <section className="rounded-xl border border-[#d8e5df] bg-[#f1f8f3] p-4"><div className="flex gap-2 text-xs font-semibold text-[#315c40]"><ShieldAlert size={15} /> Privacy boundary</div><p className="mt-2 text-[11px] leading-5 text-[#54715c]">Standard detail responses are safe and masked. Raw identifier access is a separate audited operation.</p></section>}<section className="surface-panel p-5"><div className="eyebrow">Record reference</div><div className="mono mt-2 break-all text-[11px] text-[var(--muted)]">{id}</div></section></aside></div>
    {pendingAction && <ActionDialog action={pendingAction} busy={actionBusy} error={actionError} onCancel={() => { setPendingAction(null); setActionError(null); }} onSubmit={runAction} />}
  </>;
}

function ActionDialog({ action, busy, error, onCancel, onSubmit }: { action: Action; busy: boolean; error: unknown; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const required = action.reasonLabel && !action.reasonLabel.toLowerCase().includes("optional");
  return <div className="modal-backdrop"><form className="modal-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}><button type="button" className="modal-close" onClick={onCancel} aria-label="Close"><X size={17} /></button><div className="eyebrow">Confirm workflow action</div><h2 className="mt-2 text-lg font-semibold">{action.label}</h2>{action.reasonLabel && <label className="field-label mt-5">{action.reasonLabel}<textarea className="field-control min-h-[100px] resize-y py-2.5" value={reason} onChange={(event) => setReason(event.target.value)} required={Boolean(required)} /></label>}{Boolean(error) && <div className="mt-4"><ErrorPanel error={error} /></div>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} className="secondary-button">Cancel</button><button disabled={busy} className={action.tone ? "danger-button" : "primary-button"}>{busy ? "Submitting…" : "Confirm action"}</button></div></form></div>;
}

function KycDocuments({ recordId, recordDocuments, session, onComplete }: { recordId: string; recordDocuments: Row[]; session: SessionInfo; onComplete: () => void }) {
  const [types, setTypes] = useState<Row[]>([]);
  const [typeId, setTypeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pendingDocumentId, setPendingDocumentId] = useState("");
  const [pendingDocumentConfirmed, setPendingDocumentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const canUpload = hasPermission(session, "document.create") && hasPermission(session, "kyc.update");

  useEffect(() => { let active = true; apiRequest<Row[]>("document-types").then((items) => { if (active) setTypes(items); }).catch((reason: unknown) => { if (active) setError(reason); }); return () => { active = false; }; }, []);

  const attachedTypes = new Set(recordDocuments.map((document) => {
    const type = document.document_type ?? document.document_type_id;
    return typeof type === "object" && type !== null ? String((type as Row).id ?? "") : String(type ?? "");
  }));
  async function attach(documentId: string) {
    await apiRequest(`kyc/records/${recordId}/documents`, { method: "POST", body: { document_id: documentId } });
    setPendingDocumentId("");
    setPendingDocumentConfirmed(false);
    setFile(null);
    setStatusMessage("Document attached to this KYC record.");
    onComplete();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpload) return;
    setBusy(true);
    setError(null);
    setStatusMessage("");
    try {
      if (pendingDocumentId) {
        if (!pendingDocumentConfirmed) {
          await apiRequest(`documents/documents/${pendingDocumentId}/complete`, { method: "POST", body: {} });
          setPendingDocumentConfirmed(true);
        }
        await attach(pendingDocumentId);
        return;
      }
      if (!file || !typeId) throw new Error("Choose a document type and file.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MiB or smaller.");
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const start = await apiRequest<{ document?: { id?: string }; id?: string; upload_url: string }>("documents/documents", {
        method: "POST",
        body: { document_type: typeId, owner_type: "user", owner_id: session.user.id, file_name: file.name, mime_type: file.type || "application/octet-stream", file_size: file.size, checksum, sensitivity: "STANDARD" },
      });
      const documentId = String(start.document?.id ?? start.id ?? "");
      if (!documentId || !start.upload_url) throw new Error("The API did not return an upload reference.");
      const uploaded = await fetch(start.upload_url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream", "x-amz-meta-sha256": checksum }, body: bytes });
      if (!uploaded.ok) throw new Error(`Storage upload failed (${uploaded.status}). Retry only after checking the document record.`);
      setPendingDocumentId(documentId);
      await apiRequest(`documents/documents/${documentId}/complete`, { method: "POST", body: {} });
      setPendingDocumentConfirmed(true);
      await attach(documentId);
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }

  return <section className="surface-panel p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">KYC evidence</div><h3 className="mt-1 text-sm font-semibold">Required documents</h3><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Upload bytes to the short-lived storage URL, confirm the upload, then attach the document. Uploads are not malware-scanned.</p></div><Upload size={17} className="text-[var(--leaf)]" /></div>
    {types.length > 0 && <div className="mt-4 divide-y divide-[var(--line)]">{types.map((item) => { const attached = attachedTypes.has(String(item.id)); return <div key={String(item.id)} className="flex items-center justify-between gap-3 py-2 text-xs"><span>{display(item.name)}{item.is_required_for_kyc ? <span className="ml-2 text-[10px] text-[var(--coral)]">Required</span> : null}</span><span className={attached ? "text-[#3e8057]" : "text-[var(--muted)]"}>{attached ? "Attached" : "Pending"}</span></div>; })}</div>}
    {canUpload && <form onSubmit={submit} className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-[1fr_1fr_auto]"><label className="field-label">Document type<select className="field-control" value={typeId} onChange={(event) => setTypeId(event.target.value)} disabled={Boolean(pendingDocumentId)} required><option value="">Choose type…</option>{types.filter((item) => !attachedTypes.has(String(item.id))).map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}{item.is_required_for_kyc ? " · Required" : ""}</option>)}</select></label><label className="field-label">File<input className="field-control !h-auto !py-2" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={Boolean(pendingDocumentId)} required={!pendingDocumentId} /></label><button disabled={busy || (!pendingDocumentId && (!file || !typeId))} className="primary-button self-end">{busy ? "Uploading…" : pendingDocumentId ? pendingDocumentConfirmed ? "Retry attachment" : "Retry confirmation" : "Upload and attach"}</button></form>}
    {statusMessage && <p role="status" className="mt-3 text-xs text-[#3e8057]">{statusMessage}</p>}{Boolean(error) && <div className="mt-3"><ErrorPanel error={error} /></div>}
  </section>;
}

function HistoryPanel({ history, events }: { history: unknown; events: Row[] }) {
  const historyRecord = history && typeof history === "object" ? history as Row : {};
  return <section className="surface-panel p-5 sm:p-6"><div className="flex items-center justify-between"><div><div className="eyebrow">Audit trail</div><h3 className="mt-1 text-sm font-semibold">Status history</h3></div><BadgeCheck size={17} className="text-[var(--leaf)]" /></div>{events.length === 0 ? <p className="mt-4 text-xs text-[var(--muted)]">No history events returned for this record.</p> : <ol className="mt-5 space-y-0">{events.map((event, index) => <li key={String(event.id ?? index)} className="relative flex gap-3 pb-5 last:pb-0"><span className="relative mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#cfe0d2] bg-[#f1f8f2]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--leaf)]" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2 text-xs font-semibold"><span>{display(event.action ?? event.status ?? event.event_type)}</span><span className="text-[10px] font-normal text-[var(--muted)]">{display(event.created_at ?? event.timestamp)}</span></div><div className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{display(event.actor_name ?? event.actor_id)}{event.reason ? ` · ${display(event.reason)}` : ""}</div></div></li>)}</ol>}{Boolean(historyRecord.status) && <div className="mt-4 border-t border-[var(--line)] pt-3 text-[10px] text-[var(--muted)]">Current status: <span className="font-semibold text-[var(--ink)]">{display(historyRecord.status)}</span></div>}</section>;
}

function UserDetail({ id, session, onToast, onSessionRefresh }: { id: string; session: SessionInfo; onToast: (message: string) => void; onSessionRefresh: () => Promise<void> }) {
  const editableFields: Field[] = [{ name: "email", label: "Email", type: "email" }, { name: "first_name", label: "First name" }, { name: "last_name", label: "Last name" }, { name: "phone_number", label: "Phone number", type: "tel" }];
  const actions: Action[] = [{ label: "Activate account", permission: "user.activate", path: (key) => `users/users/${key}/activate`, body: () => ({}), states: ["INACTIVE"] }, { label: "Deactivate account", permission: "user.deactivate", path: (key) => `users/users/${key}/deactivate`, body: () => ({}), states: ["ACTIVE"], tone: "danger" }];
  return <><RecordDetail id={id} title="User account" eyebrow="Access / User" endpoint={`users/users/${id}`} session={session} actions={actions} onToast={onToast} editableFields={editableFields} editPermission="user.update" /><UserRoleAssignments id={id} session={session} onToast={onToast} onSessionRefresh={onSessionRefresh} />{(session.user.user_type === "SUPER_ADMIN" || hasRole(session, "SUPER_ADMIN")) && <section className="surface-panel mt-5 flex flex-wrap items-center justify-between gap-4 p-5"><div><div className="eyebrow">Individual access</div><h2 className="mt-1 text-sm font-semibold">Direct permission grants</h2><p className="mt-1 text-xs text-[var(--muted)]">Grant additional scoped permissions to this account without changing its roles.</p></div><Link className="primary-button" href={`/admin/users/${id}/permissions`}>Manage permissions <ArrowRight size={14} /></Link></section>}</>;
}

function UserPermissionManagement({ id, session, onToast, onSessionRefresh }: { id: string; session: SessionInfo; onToast: (message: string) => void; onSessionRefresh: () => Promise<void> }) {
  const [grants, setGrants] = useState<Row[]>([]);
  const [permissions, setPermissions] = useState<Row[]>([]);
  const [permissionId, setPermissionId] = useState("");
  const [scope, setScope] = useState("OPS");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const canManage = session.user.user_type === "SUPER_ADMIN" || hasRole(session, "SUPER_ADMIN");
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    Promise.all([
      apiRequest<Row[]>(`users/users/${id}/permissions`),
      apiRequest<Row[]>("users/permissions"),
    ]).then(([grantItems, permissionItems]) => {
      if (active) { setGrants(grantItems); setPermissions(permissionItems); }
    }).catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [canManage, id, refresh]);
  if (!canManage) return <Denied title="direct user permission management" permission="SUPER_ADMIN" />;
  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scope === "ALL" && !window.confirm("ALL grants access to every object scope for this permission. Continue?")) return;
    setBusy(true); setError(null);
    try {
      await apiRequest(`users/users/${id}/permissions`, { method: "POST", body: { permission_id: permissionId, scope, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null } });
      setRefresh((value) => value + 1); setPermissionId(""); setExpiresAt(""); onToast("Direct permission granted.");
      if (id === session.user.id) await onSessionRefresh();
    } catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function revoke(grantId: string, code: string) {
    if (!window.confirm(`Revoke the direct ${code} permission grant?`)) return;
    setError(null);
    try {
      await apiRequest(`users/users/${id}/permissions/${grantId}`, { method: "DELETE" });
      setRefresh((value) => value + 1); onToast("Direct permission revoked.");
      if (id === session.user.id) await onSessionRefresh();
    } catch (reason) { setError(reason); }
  }
  return <><Link href={`/admin/users/${id}`} className="back-link"><ArrowLeft size={14} /> Back to user</Link>{heading("Direct permissions", "Access / Individual grants", "Add scoped permissions directly to this user. These grants supplement role permissions and can be revoked at any time.")}{Boolean(error) && <div className="mb-4"><ErrorPanel error={error} onRetry={() => setRefresh((value) => value + 1)} /></div>}
    <section className="surface-panel p-5 sm:p-6"><h2 className="text-sm font-semibold">Grant a permission</h2><form onSubmit={grant} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="field-label">Permission<select className="field-control" required value={permissionId} onChange={(event) => setPermissionId(event.target.value)}><option value="">Choose permission…</option>{permissions.map((permission) => <option key={String(permission.id)} value={String(permission.id)}>{String(permission.code)} — {String(permission.description ?? "")}</option>)}</select></label><label className="field-label">Scope<select className="field-control" value={scope} onChange={(event) => setScope(event.target.value)}>{scopeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="field-label">Expires (optional)<input className="field-control" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label><button className="primary-button self-end sm:justify-self-start" disabled={busy || !permissionId}>{busy ? "Saving…" : "Grant permission"}</button></form>{scope === "ALL" && <p className="mt-3 text-xs font-medium text-[#a34e3d]">ALL is broad and applies to all object scopes.</p>}</section>
    <section className="surface-panel mt-5 p-5 sm:p-6"><h2 className="text-sm font-semibold">Permission grants</h2>{grants.length === 0 ? <p className="mt-4 text-xs text-[var(--muted)]">No direct permission grants for this user.</p> : <div className="mt-3 divide-y divide-[var(--line)]">{grants.map((grantItem) => { const grantId = String(grantItem.id ?? ""); const code = String(grantItem.permission_code ?? "Permission"); const effective = Boolean(grantItem.is_effective); return <div key={grantId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="text-xs font-semibold">{code} <span className="ml-2 rounded-full bg-[#edf3ee] px-2 py-1 text-[10px]">{String(grantItem.scope)}</span></div><div className="mt-1 text-[10px] text-[var(--muted)]">{effective ? "Effective" : grantItem.is_active ? "Expired" : "Revoked"} · Granted {display(grantItem.granted_at)} · Expires {display(grantItem.expires_at ?? "No expiry")}</div></div>{Boolean(grantItem.is_active) && <button type="button" onClick={() => void revoke(grantId, code)} className="text-xs font-semibold text-[#a34e3d]">Revoke</button>}</div>; })}</div>}</section>
  </>;
}

function UserRoleAssignments({ id, session, onToast, onSessionRefresh }: { id: string; session: SessionInfo; onToast: (message: string) => void; onSessionRefresh: () => Promise<void> }) {
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [roles, setRoles] = useState<Row[]>([]);
  const [roleId, setRoleId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const canRead = hasPermission(session, "user.read");
  const canAssign = hasPermission(session, "user.assign");
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    const rolesRequest = canAssign ? apiRequest<Row[]>("users/roles") : Promise.resolve([] as Row[]);
    Promise.all([apiRequest<Row[]>(`users/users/${id}/roles`), rolesRequest])
      .then(([items, roleItems]) => { if (active) { setAssignments(items); setRoles(roleItems); } })
      .catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [canAssign, canRead, id, refresh]);
  if (!canRead) return null;
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await apiRequest(`users/users/${id}/roles`, { method: "POST", body: { role_id: roleId, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null } }); setRefresh((value) => value + 1); setRoleId(""); setExpiresAt(""); onToast("Role assigned."); if (id === session.user.id) await onSessionRefresh(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }
  async function remove(role: Row) {
    const roleCode = String(role.role_code ?? role.code ?? "");
    const targetId = String(role.role_id ?? role.id ?? "");
    if (roleCode === "SUPER_ADMIN" || !targetId || !window.confirm(`Remove the ${roleCode || "selected"} role assignment?`)) return;
    try { await apiRequest(`users/users/${id}/roles/${targetId}`, { method: "DELETE" }); setRefresh((value) => value + 1); onToast("Role assignment removed."); if (id === session.user.id) await onSessionRefresh(); }
    catch (reason) { setError(reason); }
  }
  const assignedIds = new Set(assignments.map((entry) => String(entry.role_id ?? "")));
  return <section className="surface-panel mt-5 p-5 sm:p-6"><div className="eyebrow">Access management</div><h2 className="mt-1 text-sm font-semibold">Role assignments</h2>{Boolean(error) && <div className="mt-4"><ErrorPanel error={error} /></div>}<div className="mt-4 divide-y divide-[var(--line)]">{assignments.map((assignment, index) => <div key={String(assignment.id ?? index)} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="text-xs font-semibold">{display(assignment.role_name ?? assignment.role_code)}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{assignment.is_effective ? "Effective" : assignment.is_active ? "Expired" : "Historical"} · Assigned {display(assignment.assigned_at)} · Expires {display(assignment.expires_at ?? "No expiry")}</div></div>{hasPermission(session, "user.archive") && Boolean(assignment.is_active) && assignment.role_code !== "SUPER_ADMIN" && <button onClick={() => void remove(assignment)} className="text-xs font-semibold text-[#a34e3d]">Remove</button>}</div>)}</div>
    {hasPermission(session, "user.assign") && <form onSubmit={assign} className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-[1fr_1fr_auto]"><label className="field-label">Role<select className="field-control" required value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Choose role…</option>{roles.filter((role) => role.code !== "SUPER_ADMIN" && !assignedIds.has(String(role.id))).map((role) => <option key={String(role.id)} value={String(role.id)}>{String(role.name ?? role.code)}</option>)}</select></label><label className="field-label">Expires (optional)<input className="field-control" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label><button disabled={busy || !roleId} className="primary-button self-end">{busy ? "Assigning…" : "Assign role"}</button></form>}
  </section>;
}

function RoleDetail({ id, session, onToast, onSessionRefresh }: { id: string; session: SessionInfo; onToast: (message: string) => void; onSessionRefresh: () => Promise<void> }) {
  const router = useRouter();
  const [role, setRole] = useState<Row | null>(null);
  const [permissions, setPermissions] = useState<Row[]>([]);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [permissionId, setPermissionId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; Promise.all([apiRequest<Row>(`users/roles/${id}`), apiRequest<Row[]>("users/permissions")]).then(([roleValue, permissionValues]) => { if (active) { setRole(roleValue); setRoleName(String(roleValue.name ?? "")); setRoleDescription(String(roleValue.description ?? "")); setPermissions(permissionValues); } }).catch((reason: unknown) => { if (active) setError(reason); }); return () => { active = false; }; }, [id, refresh]);
  async function mutate(path: string, method: "POST" | "DELETE", body?: Row) { try { await apiRequest(path, { method, body }); setRefresh((value) => value + 1); onToast("Role policy updated."); await onSessionRefresh(); } catch (reason) { setError(reason); } }
  async function saveMetadata(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await apiRequest(`users/roles/${id}`, { method: "PATCH", body: { name: roleName, description: roleDescription } }); setRefresh((value) => value + 1); onToast("Role details updated."); await onSessionRefresh(); } catch (reason) { setError(reason); } }
  if (!hasPermission(session, "user.read")) return <Denied title="Role policy" permission="user.read" />;
  if (!role) return error ? <ErrorPanel error={error} onRetry={() => setRefresh((value) => value + 1)} /> : <LoadingState label="Loading role policy" />;
  const roleData = role;
  const assignedPermissions = Array.isArray(role.permissions) ? role.permissions.map((item) => typeof item === "string" ? item : String((item as Row).code)) : [];
  const assignedScopes = Array.isArray(role.scopes) ? role.scopes.map((item) => typeof item === "string" ? item : String((item as Row).scope)) : [];
  const canUpdate = hasPermission(session, "user.update") && roleData.code !== "SUPER_ADMIN";
  async function deleteRole() {
    if (roleData.is_system_role || !canUpdate || !window.confirm(`Delete the unused custom role ${String(roleData.code)}?`)) return;
    try { await apiRequest(`users/roles/${id}`, { method: "DELETE" }); onToast("Custom role deleted."); router.push("/admin/roles"); }
    catch (reason) { setError(reason); }
  }
  return <><Link href="/admin/roles" className="back-link"><ArrowLeft size={14} /> Back to roles</Link>{heading(String(roleData.name ?? roleData.code ?? "Role"), "Access / Role policy", String(roleData.description ?? "Review effective scopes and permission grants."))}{Boolean(error) && <div className="mb-4"><ErrorPanel error={error} /></div>}{roleData.code === "SUPER_ADMIN" && <div className="mb-5 rounded-lg border border-[#edcf9e] bg-[#fff8e8] p-3 text-xs leading-5 text-[#7d5b20]">The protected Super Admin policy cannot be managed by delegated administrators.</div>}
    {!roleData.is_system_role && <form onSubmit={saveMetadata} className="surface-panel mb-5 grid gap-3 p-5 sm:grid-cols-[1fr_2fr_auto]"><label className="field-label">Role name<input className="field-control" value={roleName} onChange={(event) => setRoleName(event.target.value)} disabled={!canUpdate} required /></label><label className="field-label">Description<input className="field-control" value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} disabled={!canUpdate} /></label><button className="primary-button self-end" disabled={!canUpdate}>Save details</button></form>}
    <div className="grid gap-5 lg:grid-cols-2"><section className="surface-panel p-5"><div className="eyebrow">Policy scopes</div><h2 className="mt-1 text-sm font-semibold">Authorization boundary</h2><div className="mt-4 space-y-2">{scopeOptions.map((scope) => <label key={scope} className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs"><input type="checkbox" checked={assignedScopes.includes(scope)} disabled={!canUpdate} onChange={(event) => { if (scope === "ALL" && event.target.checked && !window.confirm("Grant ALL scope to this role? This is the broadest authorization scope.")) { event.target.checked = false; return; } void mutate(`users/roles/${id}/scopes${event.target.checked ? "" : `/${scope}`}`, event.target.checked ? "POST" : "DELETE", event.target.checked ? { scope } : undefined); }} /><span className="font-semibold">{scope}</span><span className="text-[var(--muted)]">{scopeDescription(scope)}</span></label>)}</div></section>
      <section className="surface-panel p-5"><div className="eyebrow">Effective grants</div><h2 className="mt-1 text-sm font-semibold">Permissions ({assignedPermissions.length})</h2><div className="mt-4 max-h-64 space-y-1 overflow-y-auto pr-1">{assignedPermissions.map((code) => { const entry = permissions.find((item) => item.code === code); const pid = entry ? String(entry.id ?? "") : ""; return <div key={code} className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 text-xs"><span className="mono text-[11px]">{code}</span>{canUpdate && pid && <button onClick={() => void mutate(`users/roles/${id}/permissions/${pid}`, "DELETE")} className="text-[10px] font-semibold text-[#a34e3d]">Revoke</button>}</div>; })}</div>{canUpdate && <div className="mt-4 flex gap-2"><select className="field-control" value={permissionId} onChange={(event) => setPermissionId(event.target.value)}><option value="">Choose permission…</option>{permissions.filter((item) => !assignedPermissions.includes(String(item.code))).map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.code)}</option>)}</select><button disabled={!permissionId} onClick={() => void mutate(`users/roles/${id}/permissions`, "POST", { permission_id: permissionId })} className="primary-button"><Plus size={14} /> Grant</button></div>}</section>
    </div>{canUpdate && !roleData.is_system_role && <div className="mt-5 flex justify-end"><button className="danger-button" onClick={() => void deleteRole()}>Delete unused custom role</button></div>}</>;
}

function PermissionDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const router = useRouter();
  const [permission, setPermission] = useState<Row | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; apiRequest<Row>(`users/permissions/${id}`).then((value) => { if (active) { setPermission(value); setDescription(String(value.description ?? "")); } }).catch((reason: unknown) => { if (active) setError(reason); }); return () => { active = false; }; }, [id]);
  if (!hasPermission(session, "user.read")) return <Denied title="Permission definition" permission="user.read" />;
  if (!permission) return error ? <ErrorPanel error={error} /> : <LoadingState label="Loading permission definition" />;
  const permissionData = permission;
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); try { await apiRequest(`users/permissions/${id}`, { method: "PATCH", body: { description } }); onToast("Permission description updated."); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  async function remove() { if (permissionData.is_system_permission || !window.confirm(`Delete custom permission ${String(permissionData.code)}? It must not be assigned to a role.`)) return; try { await apiRequest(`users/permissions/${id}`, { method: "DELETE" }); onToast("Permission deleted."); router.push("/admin/permissions"); } catch (reason) { setError(reason); } }
  const canManage = hasPermission(session, "permission.manage") && !permissionData.is_system_permission;
  return <><Link href="/admin/permissions" className="back-link"><ArrowLeft size={14} /> Back to permissions</Link>{heading(String(permissionData.code), "Access / Permission catalogue", String(permissionData.is_system_permission ? "System permission: protected" : "Custom permission definition"))}<section className="surface-panel max-w-2xl p-5 sm:p-7"><div className="mono text-xs">{String(permissionData.code)}</div><form onSubmit={save} className="mt-5"><label className="field-label">Description<textarea className="field-control min-h-24 py-2.5" value={description} onChange={(event) => setDescription(event.target.value)} required disabled={!canManage} /></label>{Boolean(error) && <div className="mt-4"><ErrorPanel error={error} /></div>}<div className="mt-5 flex justify-between border-t border-[var(--line)] pt-4">{canManage ? <button type="button" onClick={() => void remove()} className="danger-button">Delete custom permission</button> : <span className="text-xs text-[var(--muted)]">This permission is read-only.</span>}<button disabled={busy || !canManage} className="primary-button">{busy ? "Saving…" : "Save description"}</button></div></form></section></>;
}

function DocumentTypeDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const [item, setItem] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; apiRequest<Row>(`document-types/${id}`).then((value) => { if (active) setItem(value); }).catch((reason: unknown) => { if (active) setError(reason); }); return () => { active = false; }; }, [id]);
  if (!hasPermission(session, "document_type.read")) return <Denied title="Document type" permission="document_type.read" />;
  if (!item) return error ? <ErrorPanel error={error} /> : <LoadingState label="Loading document type" />;
  const itemData = item;
  async function toggleActive() { setBusy(true); try { if (itemData.active) await apiRequest(`document-types/${id}`, { method: "DELETE" }); else await apiRequest(`document-types/${id}`, { method: "PATCH", body: { active: true } }); onToast(itemData.active ? "Document type deactivated." : "Document type activated."); setItem({ ...itemData, active: !itemData.active }); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); try { const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries()) as Row; body.is_required_for_kyc = body.is_required_for_kyc === "true"; await apiRequest(`document-types/${id}`, { method: "PATCH", body }); onToast("Document type updated."); const value = await apiRequest<Row>(`document-types/${id}`); setItem(value); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  return <><Link href="/document-types" className="back-link"><ArrowLeft size={14} /> Back to document types</Link>{heading(String(itemData.name ?? "Document type"), "Verification / Document catalogue", "Document catalog changes are audited; deactivation preserves existing document references.")}<form onSubmit={save} className="surface-panel max-w-2xl space-y-4 p-5 sm:p-7"><label className="field-label">Name<input className="field-control" name="name" defaultValue={String(itemData.name ?? "")} required /></label><label className="field-label">Category<input className="field-control" name="category" defaultValue={String(itemData.category ?? "")} required /></label><label className="field-label">Required for KYC<select className="field-control" name="is_required_for_kyc" defaultValue={String(Boolean(itemData.is_required_for_kyc))}><option value="true">Required</option><option value="false">Optional</option></select></label>{Boolean(error) && <ErrorPanel error={error} />}<div className="flex justify-between border-t border-[var(--line)] pt-4"><button type="button" disabled={busy || !hasPermission(session, "document_type.archive")} onClick={() => void toggleActive()} className="danger-button">{itemData.active ? "Deactivate type" : "Reactivate type"}</button><button className="primary-button" disabled={busy || !hasPermission(session, "document_type.update")}>{busy ? "Saving…" : "Save changes"}</button></div></form></>;
}

function ArchiveDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const actions: Action[] = [{ label: "Approve archive", permission: "farmer.delete_approve", path: (key) => `farmer-deletion-requests/${key}/approve`, body: (reason) => ({ reason }), reasonLabel: "Resolution reason", states: ["PENDING"] }, { label: "Reject archive", permission: "farmer.delete_approve", path: (key) => `farmer-deletion-requests/${key}/reject`, body: (reason) => ({ reason }), reasonLabel: "Resolution reason", states: ["PENDING"], tone: "danger" }];
  return <RecordDetail id={id} title="Archive request" eyebrow="Governance / Maker-checker" endpoint={`farmer-deletion-requests/${id}`} session={session} actions={actions} onToast={onToast} />;
}

function SupportDetail({ id, session, onToast }: { id: string; session: SessionInfo; onToast: (message: string) => void }) {
  const actions: Action[] = [
    { label: "Mark in progress", permission: "support_ticket.manage", path: (key) => `support/tickets/${key}`, method: "PATCH", body: () => ({ status: "IN_PROGRESS" }), states: ["OPEN"] },
    { label: "Resolve ticket", permission: "support_ticket.manage", path: (key) => `support/tickets/${key}`, method: "PATCH", body: () => ({ status: "RESOLVED" }), states: ["OPEN", "IN_PROGRESS"] },
    { label: "Close ticket", permission: "support_ticket.manage", path: (key) => `support/tickets/${key}`, method: "PATCH", body: () => ({ status: "CLOSED" }), states: ["OPEN", "IN_PROGRESS", "RESOLVED"], tone: "danger" },
  ];
  return <RecordDetail id={id} title="Support ticket" eyebrow="Help / Support" endpoint={`support/tickets/${id}`} session={session} actions={actions} onToast={onToast} />;
}

function Dashboard({ session }: { session: SessionInfo }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const hasOperationalScope = hasScope(session, ["OPS", "AGG"]);
  const hasAssignedScope = hasScope(session, ["ASSIGNED"]);
  const isAdmin = session.user.user_type === "SUPER_ADMIN" || hasOperationalScope && hasPermission(session, "farmer.read") && hasPermission(session, "kyc.read") && hasPermission(session, "document.read");
  const isOfficer = hasAssignedScope && hasPermission(session, "field_officer.read");
  const isFarmer = hasRole(session, "FARMER") && hasPermission(session, "farmer.read");
  const isInvestor = session.user.user_type === "INVESTOR" && hasPermission(session, "kyc.read");
  const target = isAdmin ? "admin/summary" : isOfficer ? "field-officers/me/dashboard" : isFarmer ? "farmer-dashboard" : isInvestor ? "kyc/records?page=1&page_size=10" : null;
  const title = isAdmin ? "Summary" : isOfficer ? "Field officer overview" : isFarmer ? "Farmer home" : isInvestor ? "Investor home" : "Your workspace";
  useEffect(() => {
    if (!target) return;
    let active = true;
    Promise.resolve().then(() => { if (active) { setLoading(true); setError(null); } return apiRequest<Row>(target); }).then((result) => { if (active) setData(result); }).catch((reason: unknown) => { if (active) setError(reason); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [target, refresh]);
  const metricEntries = data ? Object.entries(data).filter(([, value]) => typeof value !== "object") : [];
  if (!target) return <>{heading(title, "Account / Available modules", "Screens below are limited to the permissions granted to your account.")}<WorkspaceLanding session={session} /></>;
  return <>{heading(title, isAdmin ? "Operations / Summary" : isOfficer ? "Field team / Today" : "Farmer / Account", isAdmin ? "Current status totals from the live backend. Missing buckets are treated as zero." : "A bounded snapshot of records and activity available to your account.")}{Boolean(error) && <div className="mb-5"><ErrorPanel error={error} onRetry={() => setRefresh((value) => value + 1)} /></div>}{loading && !data && !error && <LoadingState label="Loading overview" />}
    {data && <>{isAdmin && <div className="mb-5 grid gap-3 sm:grid-cols-3">{["farmers", "kyc_records", "documents"].map((group, index) => { const value = data[group] && typeof data[group] === "object" ? data[group] as Row : {}; const total = Object.values(value).reduce<number>((sum, count) => sum + Number(count ?? 0), 0); return <Metric key={group} label={group.replaceAll("_", " ")} value={String(total)} detail={`${Object.keys(value).length} status groups`} accent={index} />; })}</div>}
      {isOfficer && metricEntries.length > 0 && <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metricEntries.map(([label, value], index) => <Metric key={label} label={label.replaceAll("_", " ")} value={display(value)} detail="Current server count" accent={index} />)}</div>}
      {isAdmin && <div className="grid gap-5 lg:grid-cols-3">{["farmers", "kyc_records", "documents"].map((group) => { const counts = (data[group] as Row | undefined) ?? {}; const defaults = group === "farmers" ? farmerStatuses : group === "kyc_records" ? kycStatuses : ["ACTIVE", "VERIFIED", "ARCHIVED"]; const statuses = [...new Set([...defaults, ...Object.keys(counts)])]; return <section key={group} className="surface-panel p-5"><div className="eyebrow">Status distribution</div><h2 className="mt-1 text-sm font-semibold">{group.replaceAll("_", " ")}</h2><div className="mt-4 space-y-3">{statuses.map((status) => <div key={status} className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--muted)]">{status.replaceAll("_", " ")}</span><span className="mono font-medium">{String(counts[status] ?? 0)}</span></div>)}</div></section>; })}</div>}
      {isFarmer && <FarmerDashboard data={data} />}
      {isInvestor && <AccountKycStatus records={pageData(data).rows} />}
      {!isAdmin && isOfficer && <div className="surface-panel mt-5 flex flex-wrap items-center justify-between gap-4 p-5"><div><div className="eyebrow">Field operations</div><h2 className="mt-1 text-sm font-semibold">Your assigned work</h2><p className="mt-1 text-xs text-[var(--muted)]">Dashboard counters only. Record lists use their authorized resource endpoints.</p></div><div className="flex flex-wrap gap-2">{hasPermission(session, "farmer.read") && <Link href="/farmers" className="secondary-button">Assigned farmers <ArrowRight size={14} /></Link>}{hasPermission(session, "field_visit.read") && <Link href="/field-visits" className="secondary-button">Visits <ArrowRight size={14} /></Link>}{hasPermission(session, "field_report.read") && <Link href="/field-reports" className="secondary-button">Reports <ArrowRight size={14} /></Link>}</div></div>}
      <div className="mt-5 flex justify-end text-[10px] text-[var(--muted)]"><button className="inline-flex items-center gap-1 font-semibold" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={12} /> Refresh totals</button></div>
    </>}</>;
}

function WorkspaceLanding({ session }: { session: SessionInfo }) {
  const permittedResources = Object.entries(resources).filter(([, resource]) => hasPermission(session, resource.permission));
  const resourceCards = permittedResources.map(([key, resource]) => ({ key, resource, href: `/${routeForResource(resource)}` }));
  return resourceCards.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{resourceCards.map(({ key, resource, href }) => <Link key={key} href={href} className="surface-panel flex min-h-28 items-center justify-between gap-4 p-5 transition-colors hover:border-[#b9d0bf]"><div><div className="eyebrow">Available module</div><h2 className="mt-1 text-sm font-semibold">{resource.title}</h2></div><ArrowRight size={16} className="shrink-0 text-[var(--leaf)]" /></Link>)}</div> : <section className="surface-panel p-6"><h2 className="text-sm font-semibold">No workspace modules available</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">No supported screens are enabled for your current permissions. Contact your administrator to review your account access.</p></section>;
}

function FarmerDashboard({ data }: { data: Row }) {
  const profile = data.profile && typeof data.profile === "object" ? data.profile as Row : {};
  const groups = ["farms", "farm_crops", "weather", "service_requests", "produce_offers", "produce_settlements", "opportunities", "transactions", "documents", "notifications", "support_tickets"];
  const kycRecords = Array.isArray(data.kyc_records) ? data.kyc_records as Row[] : [];
  return <><div className="grid gap-3 sm:grid-cols-3"><Metric label="Farmer reference" value={display(profile.farmer_number ?? profile.provisional_reference)} detail="Permanent ID appears after verification" accent={0} /><Metric label="Profile status" value={display(profile.status)} detail="Profile verification is separate from KYC" accent={1} /><Metric label="Farm records" value={String(Array.isArray(data.farms) ? data.farms.length : 0)} detail="Farm status is tracked separately" accent={2} /></div><AccountKycStatus records={kycRecords} /><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{groups.map((key) => { const values = Array.isArray(data[key]) ? data[key] as Row[] : []; return <section key={key} className="surface-panel min-h-36 p-5"><div className="eyebrow">Farmer dashboard</div><div className="mt-1 flex items-center justify-between"><h2 className="text-sm font-semibold">{key.replaceAll("_", " ")}</h2><span className="mono text-xs text-[var(--muted)]">{values.length}</span></div>{values.length ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{display(values[0].name ?? values[0].status ?? values[0].reference ?? values[0].subject)}</p> : <p className="mt-3 text-xs text-[var(--muted)]">Nothing to show yet.</p>}</section>; })}</div></>;
}

function AccountKycStatus({ records }: { records: Row[] }) {
  const record = records[0];
  const status = record ? String(record.status ?? "DRAFT") : "NOT STARTED";
  const path = record?.id ? `/kyc/${String(record.id)}` : "/kyc/new";
  const action = !record ? "Start KYC" : ["DRAFT", "RETURNED"].includes(status) ? "Continue KYC" : "View KYC";
  return <section className="surface-panel mt-5 flex flex-wrap items-center justify-between gap-4 p-5"><div><div className="eyebrow">Identity verification</div><h2 className="mt-1 text-sm font-semibold">KYC status</h2><div className="mt-2 flex items-center gap-2"><span className={`status-pill ${statusClass(status)}`}>{status.replaceAll("_", " ")}</span>{status === "SUBMITTED" && <span className="text-xs text-[var(--muted)]">Your required details and documents are submitted for review.</span>}</div></div><Link href={path} className="primary-button">{action}<ArrowRight size={14} /></Link></section>;
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: number }) {
  const colors = ["bg-[#eff7ef] text-[#3e8057]", "bg-[#fff2ed] text-[#bd624c]", "bg-[#edf5f5] text-[#427c83]"];
  return <div className="surface-panel relative overflow-hidden p-5"><span className={`absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg ${colors[accent % colors.length]}`}><Activity size={15} /></span><div className="eyebrow">{label}</div><div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-[11px] text-[var(--muted)]">{detail}</div></div>;
}

function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const requestId = error instanceof ApiError ? error.requestId : null;
  return <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#efc9c0] bg-[#fff6f3] px-4 py-3 text-xs text-[#964d3e]"><CircleAlert size={16} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><div className="font-semibold">{status === 403 ? "Access not authorized" : status === 404 ? "Record unavailable" : status === 409 ? "This record changed" : status === 503 ? "A service is unavailable" : "Request failed"}</div><div className="mt-1 leading-5">{errorMessage(error)}</div>{requestId && <div className="mono mt-1 text-[10px] text-[#aa776d]">Request ID: {requestId}</div>}</div>{onRetry && <button onClick={onRetry} className="shrink-0 font-semibold">Retry</button>}</div>;
}

function Denied({ title, permission }: { title: string; permission: string }) {
  return <section className="surface-panel mx-auto max-w-xl p-7 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#fff2ed] text-[var(--coral)]"><ShieldAlert size={19} /></span><h1 className="mt-4 text-lg font-semibold">Access not authorized</h1><p className="mt-2 text-sm text-[var(--muted)]">Your current effective permissions do not allow access to {title.toLowerCase()}.</p><p className="mono mt-3 text-[10px] text-[var(--muted)]">{permission}</p></section>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="surface-panel grid min-h-52 place-items-center text-sm text-[var(--muted)]"><span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />{label}</span></div>;
}

function NotAvailable({ path }: { path: string }) {
  return <section className="surface-panel mx-auto max-w-xl p-7 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#edf3ee] text-[var(--leaf)]"><CircleAlert size={19} /></span><h1 className="mt-4 text-lg font-semibold">Screen not available</h1><p className="mt-2 text-sm text-[var(--muted)]">This route is not part of the implemented backend contract.</p><p className="mono mt-3 text-[10px] text-[var(--muted)]">{path}</p></section>;
}

function statusClass(value: string) {
  const status = value.toUpperCase();
  if (["ACTIVE", "VERIFIED", "APPROVED", "CLEAN", "TRUE", "YES", "SUCCESS"].includes(status)) return "status-good";
  if (["PENDING", "PENDING_VERIFICATION", "SUBMITTED", "REVIEWED", "NOT_SCANNED", "DRAFT", "PLANNED"].includes(status)) return "status-wait";
  if (["REJECTED", "SUSPENDED", "INACTIVE", "ARCHIVED", "FAILED", "CONFLICT", "FALSE", "NO"].includes(status)) return "status-bad";
  return "status-neutral";
}

function routeForResource(resource: Resource) {
  if (resource === resources.users) return "admin/users";
  if (resource === resources.roles) return "admin/roles";
  if (resource === resources.permissions) return "admin/permissions";
  if (resource === resources.archivals) return "admin/archivals";
  if (resource === resources.farmCrops) return "farm-crops";
  if (resource === resources.cropActivities) return "crop-activities";
  if (resource === resources.officers) return "field-officers";
  if (resource === resources.assignments) return "assignments";
  if (resource === resources.visits) return "field-visits";
  if (resource === resources.reports) return "field-reports";
  if (resource === resources.kyc) return "kyc";
  if (resource === resources.support) return "support";
  if (resource === resources.farms) return "farms";
  if (resource === resources.farmers) return "farmers";
  return resource.endpoint;
}

function backHref(eyebrow: string) {
  if (eyebrow.includes("Farmer registry")) return "/farmers";
  if (eyebrow.includes("Land /")) return "/farms";
  if (eyebrow.includes("KYC")) return "/kyc";
  if (eyebrow.includes("Field operations / Visit")) return "/field-visits";
  if (eyebrow.includes("Field operations / Report")) return "/field-reports";
  if (eyebrow.includes("User")) return "/admin/users";
  if (eyebrow.includes("Role")) return "/admin/roles";
  if (eyebrow.includes("Maker-checker")) return "/admin/archivals";
  if (eyebrow.includes("Support")) return "/support";
  return "/overview";
}

function scopeDescription(scope: string) {
  const descriptions: Record<string, string> = { OWN: "Owner context", ASSIGNED: "Assigned records", CONTEXTUAL: "Related context", OPS: "Operational access", AGG: "Aggregate access", ALL: "Broad privileged scope" };
  return descriptions[scope] ?? "";
}