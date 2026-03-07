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

export interface SectorSuggestions {
  search?: string[];
  ai_documents?: string[];
  transcription?: { speaker_labels?: string[] };
  procedures?: string[];
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  role: "super_admin" | "admin" | "user";
  tenant_id: string;
  is_active: boolean;
  enabled_modules: string[];
  tenant_sector: string | null;
  sector_suggestions: SectorSuggestions | null;
}

// ── Tenant ───────────────────────────────────────────────────────────────────

export interface TenantModule {
  module_key: string;
  enabled: boolean;
}

export interface SectorDefinition {
  id: string;
  key: string;
  label: string;
  description: string | null;
  default_modules: string[];
  suggestions: SectorSuggestions | null;
  is_active: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tenant_type: "organization" | "group";
  sector: string | null;
  parent_id: string | null;
  is_large: boolean;
  is_active: boolean;
  db_mode: "shared" | "dedicated";
  dedicated_db_name: string | null;
  modules: TenantModule[];
}

export interface TenantCreate {
  name: string;
  slug: string;
  tenant_type?: string;
  sector?: string | null;
  parent_id?: string | null;
  is_large?: boolean;
  modules?: string[];
}

export interface ProvisionResult {
  sector: string;
  procedure_templates: { id: string; name: string }[];
  document_templates: { id: string; name: string }[];
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
  | "consent_check"
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
  consent_detection_result?: string | null;
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
  consent_detection_result?: string | null;
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

// ── Consent / Attendees ─────────────────────────────────────────────────────

export type AttendeeStatus =
  | "pending"
  | "pending_oral"
  | "accepted_email"
  | "accepted_oral"
  | "refused"
  | "withdrawn";

export interface AttendeeEntry {
  contact_id: string;
  status: AttendeeStatus;
  evidence_type: string | null;
  evidence_id: string | null;
  segment_start_ms: number | null;
  segment_end_ms: number | null;
  decided_at: string | null;
  decided_by: string | null;
  withdrawn_at: string | null;
  withdrawn_via: string | null;
}

export interface AttendeesResponse {
  attendees: AttendeeEntry[];
  recording_validity: string | null;
  summary: string | null;
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
  map_system_prompt: string | null;
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
  map_system_prompt?: string | null;
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
  map_system_prompt?: string | null;
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
  invalidated_at: string | null;
  invalidated_reason: string | null;
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
  invalidated_at: string | null;
  invalidated_reason: string | null;
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
  contact_id: string | null;
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

export interface OralConsentDetection {
  detected: boolean;
  detection_type: "collective_consent" | "individual_refusal" | null;
  consent_phrase: string | null;
  segment_id: string | null;
  start_time: number | null;
  end_time: number | null;
  confidence: "high" | "medium" | "low" | null;
  explanation: string | null;
  refusal_speaker_id: string | null;
  refusal_speaker_label: string | null;
}

export interface CollectiveConsentResult {
  message: string;
  contacts: { contact_id: string; name: string }[];
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
  { key: "procedures", label: "Procédures collaboratives" },
  { key: "contacts", label: "Carnet de contacts" },
  { key: "search", label: "Recherche intelligente" },
  { key: "dictionary", label: "Dictionnaire de substitution" },
];

// ── Procédures ────────────────────────────────────────────────────────────────

export type ProcedureStatus = "draft" | "in_progress" | "collecting" | "scheduled" | "meeting" | "generating" | "done";

export type StepType = "form" | "select_contacts" | "send_email" | "collect_responses" | "generate_document" | "upload_document" | "manual";
export type StepStatus = "pending" | "active" | "completed" | "skipped";

export interface FormQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  options: string[];
  required: boolean;
}

export interface ProcedureTemplateRole {
  id: string;
  role_name: string;
  order_index: number;
  form_questions: FormQuestion[];
  invitation_delay_days: number;
}

export interface ProcedureTemplateStep {
  id: string;
  order_index: number;
  step_type: StepType;
  label: string;
  description: string | null;
  config: Record<string, unknown> | null;
  is_required: boolean;
}

export interface ProcedureTemplate {
  id: string;
  name: string;
  description: string | null;
  document_template_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  roles: ProcedureTemplateRole[];
  steps: ProcedureTemplateStep[];
}

export interface ProcedureTemplateStepCreate {
  step_type: StepType;
  label: string;
  description?: string | null;
  config?: Record<string, unknown> | null;
  is_required?: boolean;
}

export interface ProcedureTemplateCreate {
  name: string;
  description?: string | null;
  document_template_id?: string | null;
  roles: Omit<ProcedureTemplateRole, "id">[];
  steps?: ProcedureTemplateStepCreate[];
}

export interface ProcedureTemplateUpdate {
  name?: string;
  description?: string | null;
  document_template_id?: string | null;
  is_active?: boolean;
}

export interface ProcedureParticipant {
  id: string;
  name: string;
  email: string | null;
  role_name: string;
  form_questions: FormQuestion[];
  form_token: string;
  invited_at: string | null;
  responded_at: string | null;
  responses: Record<string, string> | null;
  created_at: string;
}

export interface ProcedureListItem {
  id: string;
  title: string;
  description: string | null;
  status: ProcedureStatus;
  meeting_date: string | null;
  participant_count: number;
  response_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProcedureStepInstance {
  id: string;
  order_index: number;
  step_type: StepType;
  label: string;
  description: string | null;
  config: Record<string, unknown> | null;
  status: StepStatus;
  data: Record<string, unknown> | null;
  completed_at: string | null;
}

export interface Procedure {
  id: string;
  title: string;
  description: string | null;
  status: ProcedureStatus;
  meeting_date: string | null;
  template_id: string | null;
  document_template_id: string | null;
  source_session_id: string | null;
  ai_document_id: string | null;
  current_step_index: number | null;
  created_at: string;
  updated_at: string;
  participants: ProcedureParticipant[];
  steps: ProcedureStepInstance[];
}

export interface ProcedureCreate {
  title: string;
  description?: string | null;
  template_id?: string | null;
  document_template_id?: string | null;
  meeting_date?: string | null;
}

export interface ProcedureUpdate {
  title?: string;
  description?: string | null;
  status?: ProcedureStatus;
  meeting_date?: string | null;
  document_template_id?: string | null;
  source_session_id?: string | null;
  ai_document_id?: string | null;
}

export interface ParticipantCreate {
  name: string;
  email?: string | null;
  role_name: string;
  form_questions: FormQuestion[];
}

export interface PublicFormData {
  procedure_title: string;
  participant_name: string;
  role_name: string;
  form_questions: FormQuestion[];
  already_responded: boolean;
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  group_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  speaker_profile_id: string | null;
  consent_status: string | null;
  consent_type: string | null;
  enrollment_status: string | null;
}

export interface ContactGroupDetail extends ContactGroup {
  contacts: Contact[];
}

export interface ContactGroupCreate {
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ContactGroupUpdate {
  name?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ContactCreate {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export interface ContactUpdate {
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

// ── Dictionary / Substitutions ────────────────────────────────────────────────

export interface SubstitutionRule {
  id: string;
  tenant_id: string;
  original: string;
  replacement: string;
  is_case_sensitive: boolean;
  is_whole_word: boolean;
  is_enabled: boolean;
  category: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface SubstitutionRuleCreate {
  original: string;
  replacement: string;
  is_case_sensitive?: boolean;
  is_whole_word?: boolean;
  is_enabled?: boolean;
  category?: string | null;
}

export interface SubstitutionRuleUpdate {
  original?: string;
  replacement?: string;
  is_case_sensitive?: boolean;
  is_whole_word?: boolean;
  is_enabled?: boolean;
  category?: string | null;
}

export interface SubstitutionPreview {
  original_text: string;
  substituted_text: string;
  rules_applied: number;
}

// ── Announcements (Communications) ───────────────────────────────────────────

export interface AnnouncementTenant {
  id: string;
  name: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  target_all: boolean;
  tenants: AnnouncementTenant[];
  created_at: string;
}

export interface AnnouncementCreate {
  title: string;
  message: string;
  target_all?: boolean;
  tenant_ids?: string[];
}

export interface AnnouncementUpdate {
  title?: string;
  message?: string;
  is_active?: boolean;
  target_all?: boolean;
  tenant_ids?: string[];
}

export interface ActiveAnnouncement {
  id: string;
  title: string;
  message: string;
}

// ── Search / RAG ──────────────────────────────────────────────────────────────

export interface SearchSource {
  type: string;
  id: string;
  title: string;
  relevance: number;
}

export interface SearchResponse {
  answer: string;
  sources: SearchSource[];
  chunks_used: number;
}

export interface ReindexResponse {
  ai_documents: number;
  transcriptions: number;
  procedures: number;
  contacts: number;
  chunks_total: number;
}
