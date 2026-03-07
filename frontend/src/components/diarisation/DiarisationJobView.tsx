import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Users, ShieldCheck, Play } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import {
  useDiarisationJob,
  useRenameSpeaker,
  useStartDiarisationProcessing,
} from "@/api/hooks/useDiarisation";
import { useAttendees } from "@/api/hooks/useConsent";
import type { DiarisationSSEEvent } from "@/api/types";
import { DiarisationResult } from "./DiarisationResult";
import { ConsentPanel } from "./ConsentPanel";

interface DiarisationJobViewProps {
  jobId: string;
  onBack: () => void;
}

export function DiarisationJobView({ jobId, onBack }: DiarisationJobViewProps) {
  const { data: job, refetch } = useDiarisationJob(jobId);
  const renameSpeaker = useRenameSpeaker();
  const startProcessing = useStartDiarisationProcessing();
  const qc = useQueryClient();

  const [progress, setProgress] = useState(job?.progress ?? 0);
  const [progressMessage, setProgressMessage] = useState(job?.progress_message ?? "");
  const [liveStatus, setLiveStatus] = useState(job?.status ?? "queued");
  const sseRef = useRef<AbortController | null>(null);

  const { data: attendeesData } = useAttendees(jobId);
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
          refetch();
          qc.invalidateQueries({ queryKey: ["diarisation", "jobs"] });
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

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft className="w-4 h-4" />
        Retour a la liste
      </Button>

      <div className="bg-background rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-semibold">{job?.title ?? "Transcription + Diarisation"}</h2>
          {job?.detected_speakers && liveStatus === "completed" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              <Users className="w-3 h-3" />
              {job.detected_speakers} intervenants
            </span>
          )}
        </div>
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

            <ConsentPanel jobId={jobId} />

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
                        <><Play className="w-4 h-4 mr-1" /> Lancer la transcription + diarisation</>
                      )}
                    </Button>
                  );
                }

                if (hasPendingOral) {
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
                        <><ShieldCheck className="w-4 h-4 mr-1" /> Lancer la transcription + diarisation (consentement oral à vérifier)</>
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

        {liveStatus === "completed" && job?.segments && job?.speakers && (
          <DiarisationResult
            segments={job.segments}
            speakers={job.speakers}
            jobId={jobId}
            title={job.title}
            onRenameSpeaker={handleRenameSpeaker}
          />
        )}
      </div>
    </div>
  );
}
