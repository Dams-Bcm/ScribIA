import { useState, useCallback } from "react";
import { Mic } from "lucide-react";
import {
  useTranscriptionJobs,
  useUploadAudio,
  useStartProcessing,
  useDeleteJob,
} from "@/api/hooks/useTranscription";
import { UploadArea } from "@/components/transcription/UploadArea";
import { AudioRecorder } from "@/components/transcription/AudioRecorder";
import { JobList } from "@/components/transcription/JobList";
import { TranscriptionJobView } from "@/components/transcription/TranscriptionJobView";

export function TranscriptionPage() {
  const { data: jobs = [], isLoading } = useTranscriptionJobs();
  const uploadAudio = useUploadAudio();
  const startProcessing = useStartProcessing();
  const deleteJob = useDeleteJob();

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | Blob, filename?: string) => {
      try {
        const result = await uploadAudio.mutateAsync({ file, filename });
        // Auto-start processing after upload
        await startProcessing.mutateAsync(result.id);
        setSelectedJobId(result.id);
      } catch {
        // errors handled by mutation state
      }
    },
    [uploadAudio, startProcessing],
  );

  const handleProcess = useCallback(
    async (jobId: string) => {
      try {
        await startProcessing.mutateAsync(jobId);
        setSelectedJobId(jobId);
      } catch {
        // error handled
      }
    },
    [startProcessing],
  );

  const handleDelete = useCallback(
    async (jobId: string) => {
      try {
        await deleteJob.mutateAsync(jobId);
        if (selectedJobId === jobId) setSelectedJobId(null);
      } catch {
        // error handled
      }
    },
    [deleteJob, selectedJobId],
  );

  // ── Detail view ─────────────────────────────────────────────────────
  if (selectedJobId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Transcription simple</h1>
        <p className="text-muted-foreground mb-6">Convertissez vos fichiers audio en texte</p>
        <TranscriptionJobView jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────
  const busy = uploadAudio.isPending || startProcessing.isPending;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Transcription simple</h1>
      <p className="text-muted-foreground mb-6">Convertissez vos fichiers audio en texte</p>

      <div className="space-y-6">
        {/* Upload + Record */}
        <div className="bg-background rounded-xl border border-border p-6 space-y-4">
          <UploadArea onFile={(f) => handleFile(f)} disabled={busy} />

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
                handleFile(blob, `Enregistrement ${now}.webm`);
              }}
              disabled={busy}
            />
          </div>

          {(uploadAudio.isError || startProcessing.isError) && (
            <p className="text-sm text-red-600 text-center">
              {(uploadAudio.error ?? startProcessing.error)?.message ?? "Une erreur est survenue"}
            </p>
          )}
        </div>

        {/* Jobs list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : jobs.length === 0 ? (
          <div className="bg-background rounded-xl border border-border p-8">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <Mic className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Aucune transcription</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Importez un fichier audio ou enregistrez depuis votre micro pour lancer une transcription
              </p>
            </div>
          </div>
        ) : (
          <JobList
            jobs={jobs}
            onSelect={(job) => setSelectedJobId(job.id)}
            onDelete={handleDelete}
            onProcess={handleProcess}
          />
        )}
      </div>
    </div>
  );
}
