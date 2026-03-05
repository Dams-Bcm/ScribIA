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

// ── Transcription ───────────────────────────────────────────────────────────

export type TranscriptionJobStatus =
  | "created"
  | "uploading"
  | "queued"
  | "converting"
  | "transcribing"
  | "completed"
  | "error";

export interface TranscriptionSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  order_index: number;
}

export interface TranscriptionJob {
  id: string;
  title: string;
  status: TranscriptionJobStatus;
  progress: number;
  progress_message: string | null;
  error_message: string | null;
  original_filename: string | null;
  duration_seconds: number | null;
  audio_file_size: number | null;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionJobDetail extends TranscriptionJob {
  segments: TranscriptionSegment[];
}

export interface TranscriptionUploadResponse {
  id: string;
  filename: string;
  duration_seconds: number | null;
  message: string;
}

export interface TranscriptionSSEEvent {
  status: TranscriptionJobStatus;
  progress: number;
  progress_message: string | null;
  error_message: string | null;
}

// ── Diarisation ──────────────────────────────────────────────────────────────

export type DiarisationJobStatus =
  | "created"
  | "uploading"
  | "queued"
  | "converting"
  | "diarizing"
  | "transcribing"
  | "aligning"
  | "completed"
  | "error";

export interface DiarisationSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  order_index: number;
  speaker_id: string | null;
  speaker_label: string | null;
}

export interface DiarisationSpeaker {
  id: string;
  speaker_id: string;
  display_name: string | null;
  color_index: number;
  segment_count: number;
  total_duration: number;
  profile_id: string | null;
}

export interface DiarisationJob {
  id: string;
  title: string;
  status: DiarisationJobStatus;
  progress: number;
  progress_message: string | null;
  error_message: string | null;
  original_filename: string | null;
  duration_seconds: number | null;
  audio_file_size: number | null;
  language: string;
  mode: string;
  num_speakers: number | null;
  detected_speakers: number | null;
  created_at: string;
  updated_at: string;
}

export interface DiarisationJobDetail extends DiarisationJob {
  segments: DiarisationSegment[];
  speakers: DiarisationSpeaker[];
}

export interface DiarisationUploadResponse {
  id: string;
  filename: string;
  duration_seconds: number | null;
  message: string;
}

export interface DiarisationSSEEvent {
  status: DiarisationJobStatus;
  progress: number;
  progress_message: string | null;
  error_message: string | null;
}

// ── Preparatory Phases ──────────────────────────────────────────────────────

export type DossierStatus = "draft" | "ready" | "archived";

export interface AgendaPoint {
  id: string;
  order_index: number;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DossierDocument {
  id: string;
  dossier_id: string;
  agenda_point_id: string | null;
  original_filename: string;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
}

export interface PreparatoryDossier {
  id: string;
  title: string;
  description: string | null;
  meeting_date: string | null;
  status: DossierStatus;
  point_count: number;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface PreparatoryDossierDetail {
  id: string;
  title: string;
  description: string | null;
  meeting_date: string | null;
  status: DossierStatus;
  created_at: string;
  updated_at: string;
  agenda_points: AgendaPoint[];
  documents: DossierDocument[];
}

export interface DossierCreate {
  title: string;
  description?: string | null;
  meeting_date?: string | null;
}

export interface DossierUpdate {
  title?: string;
  description?: string | null;
  meeting_date?: string | null;
  status?: DossierStatus;
}

export interface AgendaPointCreate {
  title: string;
  description?: string | null;
}

// ── AI Documents ─────────────────────────────────────────────────────────────

export type AIDocumentType = "pv" | "deliberation" | "summary" | "agenda" | "custom";
export type AIDocumentStatus = "pending" | "generating" | "completed" | "error";

export interface AIDocumentTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  document_type: AIDocumentType;
  system_prompt: string;
  user_prompt_template: string;
  ollama_model: string | null;
  temperature: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIDocumentTemplateCreate {
  name: string;
  description?: string | null;
  document_type: AIDocumentType;
  system_prompt: string;
  user_prompt_template: string;
  ollama_model?: string | null;
  temperature?: number;
  is_active?: boolean;
}

export interface AIDocumentTemplateUpdate {
  name?: string;
  description?: string | null;
  document_type?: AIDocumentType;
  system_prompt?: string;
  user_prompt_template?: string;
  ollama_model?: string | null;
  temperature?: number;
  is_active?: boolean;
}

export interface AIDocument {
  id: string;
  tenant_id: string;
  user_id: string | null;
  template_id: string | null;
  title: string;
  status: AIDocumentStatus;
  source_dossier_id: string | null;
  source_session_id: string | null;
  result_text: string | null;
  error_message: string | null;
  created_at: string;
  generation_started_at: string | null;
  generation_completed_at: string | null;
}

export interface AIDocumentListItem {
  id: string;
  title: string;
  status: AIDocumentStatus;
  template_id: string | null;
  source_dossier_id: string | null;
  source_session_id: string | null;
  created_at: string;
  generation_completed_at: string | null;
}

export interface GenerateRequest {
  template_id: string;
  title: string;
  source_dossier_id?: string | null;
  source_session_id?: string | null;
}

export interface OllamaModelsResponse {
  models: string[];
  default: string;
  error?: string;
}

// ── Compliance / RGPD ────────────────────────────────────────────────────────

export interface ConsentTypeMetric {
  granted: number;
  revoked: number;
}

export interface ConsentMetrics {
  total_users: number;
  users_with_consent: number;
  consent_rate: number;
  by_type: Record<string, ConsentTypeMetric>;
}

export interface RetentionPolicy {
  id: string;
  tenant_id: string;
  data_type: string;
  retention_days: string;
  auto_delete: string;
  description: string | null;
}

export interface RetentionPolicyCreate {
  data_type: string;
  retention_days: string;
  auto_delete: string;
  description?: string;
}

export interface AuditSummary {
  total_events: number;
  recent_events: number;
  by_action: Record<string, number>;
}

export interface RGPDRequest {
  id: string;
  tenant_id: string;
  user_id: string;
  request_type: string;
  status: string;
  notes: string | null;
  admin_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceDashboard {
  consent_metrics: ConsentMetrics;
  retention_policies: RetentionPolicy[];
  audit_summary: AuditSummary;
  pending_requests_count: number;
  overdue_requests_count: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string | null;
  user_id: string | null;
  action: string;
  resource: string | null;
  resource_id: string | null;
  ip_address: string | null;
}

// ── Speakers / Intervenants ───────────────────────────────────────────────────

export type ConsentStatus = "sent" | "accepted" | "declined";
export type ConsentType = "email" | "oral_recording";
export type ConsentScope = "individual" | "collective";
export type EnrollmentStatus = "pending_online" | "enrolled";
export type EnrollmentMethod = "online" | "operator";

export interface SpeakerProfile {
  id: string;
  tenant_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  fonction: string | null;
  email: string | null;
  phone_number: string | null;
  consent_status: ConsentStatus | null;
  consent_type: ConsentType | null;
  consent_scope: ConsentScope | null;
  consent_date: string | null;
  enrollment_status: EnrollmentStatus | null;
  enrollment_method: EnrollmentMethod | null;
  enrolled_at: string | null;
  share_with_parent_tenant: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpeakerProfileCreate {
  first_name: string;
  last_name: string;
  fonction?: string | null;
  email?: string | null;
  phone_number?: string | null;
}

// ── Modules ──────────────────────────────────────────────────────────────────

export const AVAILABLE_MODULES: ModuleDefinition[] = [
  { key: "transcription", label: "Transcription simple" },
  { key: "transcription_diarisation", label: "Transcription + Diarisation" },
  { key: "preparatory_phases", label: "Phase(s) préparatoire(s)" },
  { key: "rgpd", label: "RGPD" },
  { key: "ai_documents", label: "Génération de documents IA" },
  { key: "convocations", label: "Convocations" },
];
