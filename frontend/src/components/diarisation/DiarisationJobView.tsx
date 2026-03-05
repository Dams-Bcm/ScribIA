import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import { useDiarisationJob, useRenameSpeaker } from "@/api/hooks/useDiarisation";
import type { DiarisationSSEEvent } from "@/api/types";
import { DiarisationResult } from "./DiarisationResult";

interface DiarisationJobViewProps {
  jobId: string;
  onBack: () => void;
}

export function DiarisationJobView({ jobId, onBack }: DiarisationJobViewProps) {
  const { data: job, refetch } = useDiarisationJob(jobId);
  const renameSpeaker = useRenameSpeaker();
  const qc = useQueryClient();

  const [progress, setProgress] = useState(job?.progress ?? 0);
  const [progressMessage, setProgressMessage] = useState(job?.progress_message ?? "");
  const [liveStatus, setLiveStatus] = useState(job?.status ?? "queued");
  const sseRef = useRef<AbortController | null>(null);

  const isProcessing = ["queued", "converting", "diarizing", "transcribing", "aligning"].includes(liveStatus);

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
