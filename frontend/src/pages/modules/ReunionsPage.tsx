import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import {
  CalendarClock,
  ChevronDown,
  Loader2,
  MapPin,
  Mic,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDiarisationJobs,
  useDeleteDiarisationJob,
} from "@/api/hooks/useDiarisation";
import { usePlannedMeetings, useLinkRecording } from "@/api/hooks/usePlannedMeetings";
import { useAIDocuments } from "@/api/hooks/useAIDocuments";
import { api } from "@/api/client";
import type { DiarisationJob, DiarisationUploadResponse, PlannedMeeting } from "@/api/types";
import { UploadArea } from "@/components/transcription/UploadArea";
import { AudioRecorder } from "@/components/transcription/AudioRecorder";
import { DiarisationJobView } from "@/components/diarisation/DiarisationJobView";
import {
  CreateMeetingModal,
  MeetingDetail,
  formatDate,
} from "./PlannedMeetingsPage";

// ── Unified item type ────────────────────────────────────────────────────────

type UnifiedStatus = "planned" | "processing" | "transcribed" | "with_document" | "error";

interface UnifiedItem {
  id: string;
  type: "planned" | "job";
  title: string;
  date: string;
  location?: string;
  status: UnifiedStatus;
  plannedMeetingId?: string;
  jobId?: string;
  participantCount?: number;
  speakerCount?: number;
  durationSeconds?: number;
  documentCount: number;
  rawPlanned?: PlannedMeeting;
  rawJob?: DiarisationJob;
}

type ViewMode =
  | { kind: "list" }
  | { kind: "upload"; plannedMeetingId?: string }
  | { kind: "planned-detail"; meetingId: string }
  | { kind: "job-detail"; jobId: string };

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<UnifiedStatus, { label: string; className: string }> = {
  planned: { label: "Planifiée", className: "bg-blue-500/10 text-blue-600 border border-blue-500/20" },
  processing: { label: "En traitement", className: "bg-amber-500/10 text-amber-600 border border-amber-500/20" },
  transcribed: { label: "Transcrite", className: "bg-cyan-500/10 text-cyan-600 border border-cyan-500/20" },
  with_document: { label: "Terminée", className: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" },
  error: { label: "Erreur", className: "bg-red-500/10 text-red-600 border border-red-500/20" },
};

function UnifiedStatusBadge({ status }: { status: UnifiedStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${status === "processing" ? "animate-pulse" : ""}`} />
      {config.label}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

// ── Filter tabs ──────────────────────────────────────────────────────────────

type FilterKey = "all" | "planned" | "transcribed" | "with_document";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "planned", label: "Planifiées" },
  { key: "transcribed", label: "Transcrites" },
  { key: "with_document", label: "Avec document" },
];

// ── Main page ────────────────────────────────────────────────────────────────

export function ReunionsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Data fetching
  const { data: jobs = [], isLoading: jobsLoading } = useDiarisationJobs();
  const { data: meetings = [], isLoading: meetingsLoading } = usePlannedMeetings();
  const { data: aiDocs = [] } = useAIDocuments();

  // View state
  const [view, setView] = useState<ViewMode>(() => {
    const jobParam = searchParams.get("job");
    if (jobParam) return { kind: "job-detail", jobId: jobParam };
    const meetingParam = searchParams.get("meeting");
    if (meetingParam) return { kind: "planned-detail", meetingId: meetingParam };
    const plannedMeetingId = searchParams.get("planned_meeting_id");
    if (plannedMeetingId) return { kind: "upload", plannedMeetingId };
    return { kind: "list" };
  });

  // React to URL param changes (e.g. navigate from MeetingDetail within the same page)
  useEffect(() => {
    const jobParam = searchParams.get("job");
    if (jobParam) { setView({ kind: "job-detail", jobId: jobParam }); return; }
    const meetingParam = searchParams.get("meeting");
    if (meetingParam) { setView({ kind: "planned-detail", meetingId: meetingParam }); return; }
    const plannedMeetingId = searchParams.get("planned_meeting_id");
    if (plannedMeetingId) { setView({ kind: "upload", plannedMeetingId }); return; }
  }, [searchParams]);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Hidden file input for direct import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ACCEPTED_AUDIO = ".mp3,.wav,.m4a,.ogg,.flac,.webm,.aac,.wma,.opus";

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const deleteJob = useDeleteDiarisationJob();
  const linkRecording = useLinkRecording();

  // Build set of session IDs that have AI documents
  const sessionIdsWithDocs = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of aiDocs) {
      if (doc.source_session_id) {
        map.set(doc.source_session_id, (map.get(doc.source_session_id) ?? 0) + 1);
      }
    }
    return map;
  }, [aiDocs]);

  // Build set of job IDs linked to planned meetings
  const jobIdToMeeting = useMemo(() => {
    const map = new Map<string, PlannedMeeting>();
    for (const m of meetings) {
      if (m.job_id) map.set(m.job_id, m);
    }
    return map;
  }, [meetings]);

  // Merge planned meetings + diarisation jobs into unified list
  const items = useMemo<UnifiedItem[]>(() => {
    const result: UnifiedItem[] = [];

    // Add planned meetings WITHOUT a linked job
    for (const m of meetings) {
      if (m.job_id) continue; // Will be shown via the job
      if (m.status === "cancelled") continue;
      result.push({
        id: `pm-${m.id}`,
        type: "planned",
        title: m.title,
        date: m.meeting_date,
        location: m.location ?? undefined,
        status: "planned",
        plannedMeetingId: m.id,
        participantCount: m.participant_count,
        documentCount: 0,
        rawPlanned: m,
      });
    }

    // Add all diarisation jobs (with merged planned meeting info if linked)
    for (const j of jobs) {
      const linkedMeeting = jobIdToMeeting.get(j.id);
      const docCount = sessionIdsWithDocs.get(j.id) ?? 0;

      let status: UnifiedStatus;
      if (j.status === "error") {
        status = "error";
      } else if (j.status === "completed") {
        status = docCount > 0 ? "with_document" : "transcribed";
      } else {
        status = "processing";
      }

      result.push({
        id: `job-${j.id}`,
        type: "job",
        title: linkedMeeting?.title ?? j.title ?? j.original_filename ?? "Sans titre",
        date: linkedMeeting?.meeting_date ?? j.created_at,
        location: linkedMeeting?.location ?? undefined,
        status,
        plannedMeetingId: linkedMeeting?.id,
        jobId: j.id,
        participantCount: linkedMeeting?.participant_count,
        speakerCount: j.detected_speakers ?? undefined,
        durationSeconds: j.duration_seconds ?? undefined,
        documentCount: docCount,
        rawPlanned: linkedMeeting,
        rawJob: j,
      });
    }

    // Sort by date descending
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return result;
  }, [jobs, meetings, jobIdToMeeting, sessionIdsWithDocs]);

  // Filter
  const filtered = useMemo(() => {
    let list = items;
    if (filter === "planned") list = list.filter((i) => i.status === "planned");
    else if (filter === "transcribed") list = list.filter((i) => i.status === "transcribed" || i.status === "with_document");
    else if (filter === "with_document") list = list.filter((i) => i.status === "with_document");

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filter, search]);

  // Counts for filter tabs
  const counts = useMemo(() => ({
    all: items.length,
    planned: items.filter((i) => i.status === "planned").length,
    transcribed: items.filter((i) => i.status === "transcribed" || i.status === "with_document").length,
    with_document: items.filter((i) => i.status === "with_document").length,
  }), [items]);

  // ── Upload handler ─────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File | Blob, filename?: string, plannedMeetingId?: string) => {
      try {
        setUploadError(null);
        setUploadProgress(0);
        const result = await api.uploadWithProgress<DiarisationUploadResponse>(
          "/diarisation/upload",
          file,
          filename,
          (pct) => setUploadProgress(pct),
        );
        setUploadProgress(null);

        if (plannedMeetingId) {
          try {
            await linkRecording.mutateAsync({ meetingId: plannedMeetingId, jobId: result.id });
          } catch {
            // Non-critical
          }
        }

        qc.invalidateQueries({ queryKey: ["diarisation"] });
        qc.invalidateQueries({ queryKey: ["planned-meetings"] });
        setView({ kind: "job-detail", jobId: result.id });
      } catch (err) {
        setUploadProgress(null);
        setUploadError(err instanceof Error ? err.message : "Une erreur est survenue");
      }
    },
    [qc, linkRecording],
  );

  const handleDelete = useCallback(
    (item: UnifiedItem) => {
      if (item.type === "job" && item.jobId) {
        confirm({
          title: "Supprimer cette réunion ?",
          description: "La transcription et les données associées seront supprimées. Cette action est irréversible.",
          confirmLabel: "Supprimer",
          onConfirm: async () => {
            await deleteJob.mutateAsync(item.jobId!);
          },
        });
      }
    },
    [deleteJob, confirm],
  );

  const handleItemClick = (item: UnifiedItem) => {
    if (item.type === "planned" && item.plannedMeetingId) {
      setView({ kind: "planned-detail", meetingId: item.plannedMeetingId });
    } else if (item.jobId) {
      setView({ kind: "job-detail", jobId: item.jobId });
    }
  };

  const goToList = () => {
    setView({ kind: "list" });
    setSearchParams({}, { replace: true });
  };

  // ── Upload view ────────────────────────────────────────────────────────────

  if (view.kind === "upload") {
    const busy = uploadProgress !== null;
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Réunions</h1>
        <p className="text-muted-foreground mb-6">Nouvelle réunion — importer ou enregistrer</p>

        <Button variant="ghost" size="sm" onClick={goToList} className="mb-4">
          ← Retour à la liste
        </Button>

        <div className="bg-background rounded-xl border border-border p-3 sm:p-6 space-y-4">
          <UploadArea
            onFile={(f) => handleFile(f, undefined, view.plannedMeetingId)}
            disabled={busy}
          />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex justify-center">
            <AudioRecorder
              onRecording={(blob) => {
                const now = new Date().toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                handleFile(blob, `Enregistrement ${now}.webm`, view.plannedMeetingId);
              }}
              disabled={busy}
            />
          </div>

          {uploadProgress !== null && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="w-4 h-4 animate-pulse" />
                <span>Upload en cours… {uploadProgress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <p className="text-sm text-red-600 text-center">{uploadError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Planned meeting detail ─────────────────────────────────────────────────

  if (view.kind === "planned-detail") {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Réunions</h1>
        <p className="text-muted-foreground mb-6">Détail de la réunion planifiée</p>
        <MeetingDetail meetingId={view.meetingId} onBack={goToList} />
        {confirmDialog}
      </div>
    );
  }

  // ── Job detail ─────────────────────────────────────────────────────────────

  if (view.kind === "job-detail") {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Réunions</h1>
        <p className="text-muted-foreground mb-6">Transcription avec identification des intervenants</p>
        <DiarisationJobView jobId={view.jobId} onBack={goToList} />
        {confirmDialog}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  const isLoading = jobsLoading || meetingsLoading;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Réunions</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Planifiez, enregistrez et générez des documents
          </p>
        </div>
        <div className="relative">
          <Button onClick={() => setShowDropdown(!showDropdown)}>
            <Plus className="w-4 h-4 mr-1" />
            Nouvelle réunion
            <ChevronDown className="w-3.5 h-3.5 ml-1" />
          </Button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[200px]">
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                  onClick={() => { setShowDropdown(false); fileInputRef.current?.click(); }}
                >
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  Importer un audio
                </button>
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                  onClick={() => { setShowDropdown(false); setView({ kind: "upload" }); }}
                >
                  <Mic className="w-4 h-4 text-muted-foreground" />
                  Enregistrer en direct
                </button>
                <div className="h-px bg-border my-1" />
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                  onClick={() => { setShowDropdown(false); setShowCreate(true); }}
                >
                  <CalendarClock className="w-4 h-4 text-muted-foreground" />
                  Planifier une réunion
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <div className="flex bg-background border border-border rounded-lg overflow-x-auto">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                filter === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              } ${key !== "all" ? "border-l border-border" : ""}`}
            >
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                filter === key ? "bg-primary/20" : "bg-muted"
              }`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm bg-background w-full sm:w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-background rounded-xl border border-border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 flex items-center justify-center mb-4">
              <CalendarClock className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Aucune réunion</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Importez un audio, enregistrez depuis votre micro ou planifiez une réunion pour commencer
            </p>
            <Button onClick={() => setView({ kind: "upload" })}>
              <Plus className="w-4 h-4 mr-1" /> Nouvelle réunion
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium">Réunion</th>
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Statut</th>
                <th className="text-center px-4 py-2.5 font-medium hidden md:table-cell">Participants</th>
                <th className="text-center px-4 py-2.5 font-medium hidden md:table-cell">Documents</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => handleItemClick(item)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.title}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>📅 {formatDate(item.date)}</span>
                      {item.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {item.location}
                        </span>
                      )}
                      {item.durationSeconds && (
                        <span>⏱ {formatDuration(item.durationSeconds)}</span>
                      )}
                      {item.speakerCount && (
                        <span className="hidden lg:inline">👥 {item.speakerCount} intervenants</span>
                      )}
                    </div>
                    {/* Mobile: show status inline */}
                    <div className="sm:hidden mt-1.5">
                      <UnifiedStatusBadge status={item.status} />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <UnifiedStatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {item.participantCount ? (
                      <span className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {item.participantCount}
                      </span>
                    ) : item.speakerCount ? (
                      <span className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {item.speakerCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {item.documentCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <Sparkles className="w-3 h-3" />
                        {item.documentCount}
                      </span>
                    ) : item.status === "transcribed" ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.jobId) setView({ kind: "job-detail", jobId: item.jobId });
                        }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Sparkles className="w-3 h-3" />
                        Générer
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {item.status === "planned" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setView({ kind: "upload", plannedMeetingId: item.plannedMeetingId });
                          }}
                        >
                          ▶ Démarrer
                        </Button>
                      )}
                      {item.type === "job" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Hidden file input for direct import */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_AUDIO}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Upload progress overlay */}
      {uploadProgress !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-xl p-6 shadow-lg w-80 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="w-4 h-4 animate-pulse" />
              <span>Upload en cours… {uploadProgress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="fixed bottom-4 right-4 z-50 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm shadow-lg">
          {uploadError}
          <button className="ml-3 underline" onClick={() => setUploadError(null)}>Fermer</button>
        </div>
      )}

      {confirmDialog}
      {showCreate && <CreateMeetingModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
