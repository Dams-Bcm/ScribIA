import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, Loader2, Users, CheckCircle2, AlertTriangle, ServerCrash, Sparkles, FileText, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import {
  useDiarisationJob,
  useRenameSpeaker,
  useStartDiarisationProcessing,
  useStartDiarisationPartialAnalysis,
  useProceedToFullDiarisation,
  useDeleteDiarisationJob,
} from "@/api/hooks/useDiarisation";
import { useAIDocuments, useTemplates, useGenerateDocument, useDeleteAIDocument } from "@/api/hooks/useAIDocuments";
import { useAttendees } from "@/api/hooks/useConsent";
import type { DiarisationSSEEvent } from "@/api/types";
import { DiarisationResult } from "./DiarisationResult";
import { ConsentPanel } from "./ConsentPanel";
import { DocumentViewer } from "@/components/ai_documents/DocumentViewer";
import { cn } from "@/lib/utils";

interface DiarisationJobViewProps {
  jobId: string;
  onBack: () => void;
}

export function DiarisationJobView({ jobId, onBack }: DiarisationJobViewProps) {
  const { data: job, refetch } = useDiarisationJob(jobId);
  const renameSpeaker = useRenameSpeaker();
  const startProcessing = useStartDiarisationProcessing();
  const startPartialAnalysis = useStartDiarisationPartialAnalysis();
  const proceedMutation = useProceedToFullDiarisation();
  const deleteJob = useDeleteDiarisationJob();
  const qc = useQueryClient();

  const [progress, setProgress] = useState(job?.progress ?? 0);
  const [progressMessage, setProgressMessage] = useState(job?.progress_message ?? "");
  const [liveStatus, setLiveStatus] = useState(job?.status ?? "queued");
  const [activeTab, setActiveTab] = useState<"transcription" | "documents" | "participants">("transcription");
  const sseRef = useRef<AbortController | null>(null);

  const isProcessing = ["queued", "converting", "diarizing", "transcribing", "aligning"].includes(liveStatus) && (job?.progress ?? 0) > 0;
  const isWaitingForAttendees = liveStatus === "queued" && (job?.progress ?? 0) === 0;

  // Connect to SSE when job is processing
  useEffect(() => {
    if (!isProcessing) return;

    const controller = api.streamSSE(
      `/diarisation/${jobId}/events`,
      (data) => {
        const evt = data as unknown as DiarisationSSEEvent;
        setProgress(evt.progress);
        setProgressMessage(evt.progress_message ?? "");
        setLiveStatus(evt.status);

        if (evt.status === "completed" || evt.status === "error") {
          // Delay refetch slightly to let auto-detection finish updating attendees
          setTimeout(() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["diarisation", "jobs"] });
            qc.invalidateQueries({ queryKey: ["consent", "attendees", jobId] });
          }, 2000);
        } else if (evt.status === "consent_check") {
          // Refetch immediately — consent_detection_result is already committed
          refetch();
          qc.invalidateQueries({ queryKey: ["diarisation", "jobs"] });
          qc.invalidateQueries({ queryKey: ["consent", "attendees", jobId] });
        }
      },
      () => {
        // SSE stream ended
      },
    );
    sseRef.current = controller;

    return () => controller.abort();
  }, [jobId, isProcessing, refetch, qc]);

  // Sync from job data
  useEffect(() => {
    if (job) {
      setLiveStatus(job.status);
      setProgress(job.progress);
      setProgressMessage(job.progress_message ?? "");
    }
  }, [job]);

  // Polling fallback: refetch every 3s while processing (in case SSE misses events)
  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      refetch();
    }, 3000);
    return () => clearInterval(interval);
  }, [isProcessing, refetch]);

  const handleRenameSpeaker = (speakerId: string, displayName: string) => {
    renameSpeaker.mutate({ jobId, speakerId, displayName });
  };

  // Parse consent detection result
  const consentDetection = (() => {
    if (liveStatus !== "consent_check" || !job?.consent_detection_result) return null;
    try { return JSON.parse(job.consent_detection_result); } catch { return null; }
  })();
  const consentDetected = consentDetection?.detected === true;
  const consentRefused = consentDetection !== null && !consentDetected;

  // Auto-proceed when consent is detected (after 3s display)
  const autoProceedRef = useRef(false);
  useEffect(() => {
    if (!consentDetected || autoProceedRef.current || proceedMutation.isPending) return;
    const timer = setTimeout(async () => {
      autoProceedRef.current = true;
      await proceedMutation.mutateAsync({ jobId });
      refetch();
    }, 3000);
    return () => clearTimeout(timer);
  }, [consentDetected, jobId, proceedMutation, refetch]);

  const handleBack = () => {
    if (consentRefused) {
      deleteJob.mutate(jobId, { onSettled: onBack });
    } else {
      onBack();
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4" disabled={deleteJob.isPending}>
        <ArrowLeft className="w-4 h-4" />
        {consentRefused ? "Supprimer et retour" : "Retour"}
      </Button>

      {/* ── Compact header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
        <h2 className="text-base font-semibold truncate">{job?.title ?? "Transcription + Diarisation"}</h2>
        {job?.original_filename && (
          <>
            <span className="text-muted-foreground/40 hidden sm:inline">·</span>
            <span className="text-sm text-muted-foreground truncate">{job.original_filename}</span>
          </>
        )}
        {job?.detected_speakers && liveStatus === "completed" && (
          <>
            <span className="text-muted-foreground/40 hidden sm:inline">·</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
              <Users className="w-3 h-3" />
              {job.detected_speakers} intervenants
            </span>
          </>
        )}
        {liveStatus === "completed" && (
          <div className="ml-auto flex-shrink-0">
            <ConsentPanel compact jobId={jobId} />
          </div>
        )}
      </div>

      <div>

        {isWaitingForAttendees && (
          <ConsentPanel
            jobId={jobId}
            hideOralDetection
            onLaunchTranscription={async (numSpeakers) => {
              await startProcessing.mutateAsync({ jobId, numSpeakers });
              refetch();
            }}
            launchPending={startProcessing.isPending}
            onVerifyOralConsent={async (numSpeakers) => {
              await startPartialAnalysis.mutateAsync({ jobId, numSpeakers });
              refetch();
            }}
            verifyPending={startPartialAnalysis.isPending}
          />
        )}

        {isProcessing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progressMessage || "Traitement en cours..."}
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        )}

        {liveStatus === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {job?.error_message ?? "Une erreur est survenue"}
          </div>
        )}

        {liveStatus === "consent_check" && job?.status === "consent_check" && (() => {
          const detection = job.consent_detection_result ? JSON.parse(job.consent_detection_result) : null;
          const consentDetected = detection?.detected;

          return (
            <div className="space-y-4">
              {/* Auto-detection result banner */}
              {detection && consentDetected && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 dark:bg-green-950 dark:border-green-800">
                  <div className="flex items-start gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold text-green-800 dark:text-green-200">
                      Consentement oral détecté
                    </h3>
                    {detection.confidence && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                        {detection.confidence}
                      </span>
                    )}
                  </div>
                  {detection.announcement && (
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Annonce : &laquo; {detection.announcement} &raquo;
                    </p>
                  )}
                  {detection.consent_phrase && (
                    <p className="text-sm text-green-700 dark:text-green-300 italic">
                      Acceptation : &laquo; {detection.consent_phrase} &raquo;
                    </p>
                  )}
                  {!detection.consent_phrase && detection.confidence === "medium" && (
                    <p className="text-sm text-green-700 dark:text-green-300 italic">
                      Consentement implicite (absence d'objection)
                    </p>
                  )}
                  {detection.start_time != null && (
                    <p className="text-xs text-green-600 mt-1">
                      à {Math.floor(detection.start_time / 60)}:{String(Math.floor(detection.start_time % 60)).padStart(2, "0")}
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300 mt-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Lancement automatique de la transcription complète…
                  </p>
                </div>
              )}

              {detection && !consentDetected && (detection.error === "ai_unavailable" || detection.error === "ai_error") && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 dark:bg-red-950 dark:border-red-800">
                  <div className="flex items-start gap-2 mb-1">
                    <ServerCrash className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold text-red-800 dark:text-red-200">
                      Service IA indisponible
                    </h3>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {detection.explanation || "Le service d'intelligence artificielle est actuellement indisponible."}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-2">
                    Veuillez vérifier que le service est démarré ou obtenir le consentement par email.
                  </p>
                </div>
              )}

              {detection && !consentDetected && !detection.error && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 dark:bg-amber-950 dark:border-amber-800">
                  <div className="flex items-start gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                      Aucun consentement oral détecté
                    </h3>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {detection.explanation || "Aucune phrase de consentement détectée dans les 60 premières secondes."}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                    Veuillez obtenir le consentement par email de tous les participants avant de lancer la transcription.
                  </p>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-2">
                    Cette réunion va être supprimée.
                  </p>
                </div>
              )}

              {detection && !consentDetected && detection.error === "no_speech" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 dark:bg-amber-950 dark:border-amber-800">
                  <div className="flex items-start gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                      Aucune parole détectée
                    </h3>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {detection.explanation || "Aucune parole détectée dans les 60 premières secondes de l'audio."}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                    Veuillez obtenir le consentement par email de tous les participants avant de lancer la transcription.
                  </p>
                </div>
              )}

              {!detection && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 dark:bg-amber-950 dark:border-amber-800">
                  <div className="flex items-start gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                      Analyse partielle terminée — en attente de vérification
                    </h3>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Les 60 premières secondes ont été transcrites mais la détection automatique du consentement n'a pas été effectuée.
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                    Veuillez obtenir le consentement par email de tous les participants avant de lancer la transcription.
                  </p>
                </div>
              )}

              {job.segments && job.segments.length > 0 && consentDetected && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Aperçu (~60 premières secondes)
                  </h4>
                  <div className="bg-muted/30 rounded-lg p-3 sm:p-4 max-h-60 overflow-y-auto text-sm space-y-1">
                    {job.segments.map((seg) => (
                      <p key={seg.order_index}>
                        <span className="text-xs text-muted-foreground font-mono mr-2">
                          {Math.floor(seg.start_time / 60)}:{String(Math.floor(seg.start_time % 60)).padStart(2, "0")}
                        </span>
                        {seg.text}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>

        {liveStatus === "completed" && (
          <CompletedTabs
            jobId={jobId}
            job={job}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onRenameSpeaker={handleRenameSpeaker}
          />
        )}
    </div>
  );
}

// ── Tab system for completed jobs ─────────────────────────────────────────────

function CompletedTabs({
  jobId,
  job,
  activeTab,
  setActiveTab,
  onRenameSpeaker,
}: {
  jobId: string;
  job: ReturnType<typeof useDiarisationJob>["data"];
  activeTab: "transcription" | "documents" | "participants";
  setActiveTab: (tab: "transcription" | "documents" | "participants") => void;
  onRenameSpeaker: (speakerId: string, displayName: string) => void;
}) {
  const { data: allDocs = [] } = useAIDocuments();
  const { data: attendeesData } = useAttendees(jobId);
  const docCount = useMemo(
    () => allDocs.filter((d) => d.source_session_id === jobId).length,
    [allDocs, jobId],
  );
  const attendeeCount = attendeesData?.attendees?.length ?? 0;

  const goToDocuments = useCallback(() => setActiveTab("documents"), [setActiveTab]);

  const tabs = [
    { key: "transcription" as const, label: "Transcription", icon: FileText },
    { key: "documents" as const, label: "Documents IA", icon: Sparkles, count: docCount },
    { key: "participants" as const, label: "Participants", icon: Users, count: attendeeCount },
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-0 border-b-2 border-border mt-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-[2px] transition-colors",
              activeTab === tab.key
                ? "text-primary border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground",
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === "transcription" && job?.segments && job?.speakers && (
        <div className="mt-4">
          <DiarisationResult
            segments={job.segments}
            speakers={job.speakers}
            jobId={jobId}
            title={job.title}
            onRenameSpeaker={onRenameSpeaker}
            onGoToDocuments={goToDocuments}
            docCount={docCount}
          />
        </div>
      )}

      {activeTab === "documents" && (
        <DocumentsSection jobId={jobId} jobTitle={job?.title} />
      )}

      {activeTab === "participants" && (
        <ParticipantsPanel jobId={jobId} />
      )}
    </>
  );
}

// ── Participants panel ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  accepted_email: { label: "Consentement email", className: "bg-blue-50 text-blue-700" },
  accepted_oral: { label: "Consentement oral", className: "bg-emerald-50 text-emerald-700" },
  pending_oral: { label: "En attente (oral)", className: "bg-amber-50 text-amber-700" },
  pending: { label: "En attente", className: "bg-amber-50 text-amber-700" },
  refused: { label: "Refusé", className: "bg-red-50 text-red-700" },
  withdrawn: { label: "Retiré", className: "bg-gray-100 text-gray-600" },
};

function ParticipantsPanel({ jobId }: { jobId: string }) {
  const { data } = useAttendees(jobId);
  const attendees = data?.attendees ?? [];

  if (attendees.length === 0) {
    return (
      <div className="mt-4 bg-muted/20 rounded-xl border border-dashed border-border p-8 text-center">
        <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Aucun participant enregistré</p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {attendees.map((a) => {
        const statusConf = (STATUS_LABELS[a.status] ?? STATUS_LABELS.pending)!;
        return (
          <div key={a.contact_id} className="bg-background rounded-lg border border-border p-4">
            <p className="text-sm font-semibold">{a.contact_name ?? "Inconnu"}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusConf.className)}>
                {statusConf.label}
              </span>
              {a.decided_at && (
                <span className="text-xs text-muted-foreground">
                  {new Date(a.decided_at).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Documents IA section (inline in job detail) ──────────────────────────────

function DocumentsSection({ jobId, jobTitle }: { jobId: string; jobTitle?: string | null }) {
  const { data: allDocs = [] } = useAIDocuments();
  const { data: templates = [] } = useTemplates();
  const generate = useGenerateDocument();
  const deleteDoc = useDeleteAIDocument();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);

  const docs = useMemo(
    () => allDocs.filter((d) => d.source_session_id === jobId),
    [allDocs, jobId],
  );

  const activeTemplates = templates.filter((t) => t.is_active);

  async function handleGenerate() {
    if (!templateId || !title) return;
    const result = await generate.mutateAsync({
      template_id: templateId,
      title,
      source_session_id: jobId,
    });
    setShowGenerate(false);
    setTemplateId("");
    setTitle("");
    setSelectedDocId(result.id);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Documents IA
          {docs.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({docs.length})</span>
          )}
        </h3>
        <Button
          size="sm"
          variant={docs.length > 0 ? "outline" : "default"}
          onClick={() => {
            setShowGenerate(true);
            setTitle(jobTitle ?? "");
          }}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1" />
          {docs.length > 0 ? "Nouveau document IA" : "Générer un document IA"}
        </Button>
      </div>

      {/* Generate form */}
      {showGenerate && (
        <div className="bg-background rounded-xl border border-border p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="">Choisir un template…</option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Titre du document</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Compte rendu du 15/03/2026"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowGenerate(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!templateId || !title || generate.isPending}
            >
              {generate.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Lancement…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1" /> Générer</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Existing documents */}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className={`bg-background rounded-lg border p-3 cursor-pointer transition-colors ${
                selectedDocId === doc.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
              }`}
              onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{doc.title}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    doc.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : doc.status === "generating"
                        ? "bg-amber-500/10 text-amber-600"
                        : doc.status === "error"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-muted text-muted-foreground"
                  }`}>
                    {doc.status === "completed" ? "Terminé"
                      : doc.status === "generating" ? "En cours…"
                      : doc.status === "error" ? "Erreur"
                      : "En attente"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteDoc.mutate(doc.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document viewer */}
      {selectedDocId && (
        <div className="mt-4 bg-background rounded-xl border border-border p-4 sm:p-6">
          <DocumentViewer docId={selectedDocId} />
        </div>
      )}

      {/* Empty state */}
      {docs.length === 0 && !showGenerate && (
        <div className="bg-muted/20 rounded-xl border border-dashed border-border p-6 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Aucun document généré pour cette transcription
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Cliquez sur "Générer un document" pour créer un compte rendu, une synthèse ou tout autre document
          </p>
        </div>
      )}
    </div>
  );
}
