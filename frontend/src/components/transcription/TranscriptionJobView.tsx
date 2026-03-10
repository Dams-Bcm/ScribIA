import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck, Play, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import {
  useTranscriptionJob,
  useStartProcessing,
  useStartPartialAnalysis,
  useProceedToFullTranscription,
  useDeleteJob,
} from "@/api/hooks/useTranscription";
import { useAttendees } from "@/api/hooks/useConsent";
import type { TranscriptionSSEEvent } from "@/api/types";
import { TranscriptionResult } from "./TranscriptionResult";
import { ConsentPanel } from "@/components/diarisation/ConsentPanel";

interface TranscriptionJobViewProps {
  jobId: string;
  onBack: () => void;
}

export function TranscriptionJobView({ jobId, onBack }: TranscriptionJobViewProps) {
  const { data: job, refetch } = useTranscriptionJob(jobId);
  const qc = useQueryClient();

  const [progress, setProgress] = useState(job?.progress ?? 0);
  const [progressMessage, setProgressMessage] = useState(job?.progress_message ?? "");
  const [liveStatus, setLiveStatus] = useState(job?.status ?? "queued");
  const sseRef = useRef<AbortController | null>(null);

  const startProcessing = useStartProcessing();
  const startPartialAnalysis = useStartPartialAnalysis();
  const proceedMutation = useProceedToFullTranscription();
  const deleteJob = useDeleteJob();
  const { data: attendeesData } = useAttendees(jobId);
  const isProcessing = ["queued", "converting", "transcribing"].includes(liveStatus) && (job?.progress ?? 0) > 0;
  const isWaitingForAttendees = liveStatus === "queued" && (job?.progress ?? 0) === 0;

  // Connect to SSE when job is processing
  useEffect(() => {
    if (!isProcessing) return;

    const controller = api.streamSSE(
      `/transcription/${jobId}/events`,
      (data) => {
        const evt = data as unknown as TranscriptionSSEEvent;
        setProgress(evt.progress);
        setProgressMessage(evt.progress_message ?? "");
        setLiveStatus(evt.status);

        if (evt.status === "completed" || evt.status === "error" || evt.status === "consent_check") {
          // Delay refetch slightly to let auto-detection finish updating attendees
          setTimeout(() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["transcription", "jobs"] });
            qc.invalidateQueries({ queryKey: ["consent", "attendees", jobId] });
          }, 2000);
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

  // Detect if oral consent was refused (no consent detected)
  const consentRefused = (() => {
    if (liveStatus !== "consent_check" || !job?.consent_detection_result) return false;
    try {
      const det = JSON.parse(job.consent_detection_result);
      return !det.detected;
    } catch { return false; }
  })();

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
        {consentRefused ? "Supprimer et retour à la liste" : "Retour à la liste"}
      </Button>

      <div className="bg-background rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-1">{job?.title ?? "Transcription"}</h2>
        {job?.original_filename && (
          <p className="text-sm text-muted-foreground mb-4">{job.original_filename}</p>
        )}

        {isWaitingForAttendees && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-950 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                  Sélection des participants
                </h3>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                Avant de lancer la transcription, renseignez les participants présents lors de cet enregistrement
                pour vérifier leur consentement RGPD.
              </p>
            </div>

            <ConsentPanel jobId={jobId} hideOralDetection />

            <div className="flex gap-3">
              {(() => {
                const attendees = attendeesData?.attendees ?? [];
                const hasPendingOral = attendees.some((a) => a.status === "pending_oral");
                const hasRefused = attendees.some((a) => a.status === "refused" || a.status === "withdrawn");
                const allAccepted = attendees.length > 0 && attendees.every((a) =>
                  a.status === "accepted_email" || a.status === "accepted_oral"
                );

                if (hasRefused) {
                  return (
                    <p className="text-sm text-red-600">
                      Un ou plusieurs participants ont refusé. La transcription est bloquée.
                    </p>
                  );
                }

                if (allAccepted) {
                  return (
                    <Button
                      onClick={async () => {
                        await startProcessing.mutateAsync(jobId);
                        refetch();
                      }}
                      disabled={startProcessing.isPending}
                    >
                      {startProcessing.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Lancement…</>
                      ) : (
                        <><Play className="w-4 h-4 mr-1" /> Lancer la transcription</>
                      )}
                    </Button>
                  );
                }

                if (hasPendingOral) {
                  return (
                    <Button
                      onClick={async () => {
                        await startPartialAnalysis.mutateAsync(jobId);
                        refetch();
                      }}
                      disabled={startPartialAnalysis.isPending}
                    >
                      {startPartialAnalysis.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Lancement…</>
                      ) : (
                        <><ShieldCheck className="w-4 h-4 mr-1" /> Analyser les 60 premières secondes (vérification consentement oral)</>
                      )}
                    </Button>
                  );
                }

                // No attendees yet — must add at least one
                return (
                  <p className="text-sm text-muted-foreground">
                    Ajoutez au moins un participant pour pouvoir lancer la transcription.
                  </p>
                );
              })()}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progressMessage || "Traitement en cours..."}
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
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

        {liveStatus === "consent_check" && job && (() => {
          const detection = job.consent_detection_result ? JSON.parse(job.consent_detection_result) : null;
          const consentDetected = detection?.detected;

          return (
            <div className="space-y-4">
              {/* Auto-detection result banner */}
              {detection && consentDetected && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 dark:bg-green-950 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
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
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={async () => {
                      await proceedMutation.mutateAsync(jobId);
                      refetch();
                    }}
                    disabled={proceedMutation.isPending}
                  >
                    {proceedMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Lancement…</>
                    ) : (
                      <><Play className="w-4 h-4 mr-1" /> Consentement vérifié — Lancer la transcription complète</>
                    )}
                  </Button>
                </div>
              )}

              {detection && !consentDetected && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 dark:bg-amber-950 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
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

              {!detection && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 dark:bg-amber-950 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                      Analyse partielle terminée
                    </h3>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                    Les 60 premières secondes ont été transcrites. Vérifiez le consentement oral.
                  </p>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await proceedMutation.mutateAsync(jobId);
                      refetch();
                    }}
                    disabled={proceedMutation.isPending}
                  >
                    {proceedMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Lancement…</>
                    ) : (
                      <><Play className="w-4 h-4 mr-1" /> Consentement vérifié — Lancer la transcription complète</>
                    )}
                  </Button>
                </div>
              )}

              {job.segments && job.segments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Aperçu (~60 premières secondes)
                  </h4>
                  <div className="bg-muted/30 rounded-lg p-4 max-h-60 overflow-y-auto text-sm space-y-1">
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

        {liveStatus === "completed" && job?.segments && (
          <TranscriptionResult segments={job.segments} jobId={jobId} title={job.title} />
        )}
      </div>
    </div>
  );
}
