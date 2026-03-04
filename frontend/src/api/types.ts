// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// ── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  role: "super_admin" | "admin" | "user";
  tenant_id: string;
  is_active: boolean;
  enabled_modules: string[];
}

// ── Tenant ───────────────────────────────────────────────────────────────────

export interface TenantModule {
  module_key: string;
  enabled: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tenant_type: "organization" | "group";
  parent_id: string | null;
  is_large: boolean;
  is_active: boolean;
  modules: TenantModule[];
}

export interface TenantCreate {
  name: string;
  slug: string;
  tenant_type?: string;
  parent_id?: string | null;
  is_large?: boolean;
  modules?: string[];
}

export interface TenantUpdate {
  name?: string;
  slug?: string;
  tenant_type?: string;
  parent_id?: string | null;
  is_large?: boolean;
  is_active?: boolean;
}

// ── Modules ──────────────────────────────────────────────────────────────────

export interface ModuleDefinition {
  key: string;
  label: string;
}

export const AVAILABLE_MODULES: ModuleDefinition[] = [
  { key: "transcription", label: "Transcription simple" },
  { key: "transcription_diarisation", label: "Transcription + Diarisation" },
  { key: "legal_compliance", label: "Conformité légale" },
  { key: "ai_documents", label: "Génération de documents IA" },
  { key: "convocations", label: "Convocations" },
];
