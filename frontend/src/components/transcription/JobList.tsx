import { Trash2, Play, Eye, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TranscriptionJob } from "@/api/types";

interface JobListProps {
  jobs: TranscriptionJob[];
  onSelect: (job: TranscriptionJob) => void;
  onDelete: (jobId: string) => void;
  onProcess: (jobId: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "outline" }> = {
  created: { label: "Créé", variant: "secondary" },
  uploading: { label: "Upload", variant: "secondary" },
  queued: { label: "En attente", variant: "warning" },
  converting: { label: "Conversion", variant: "warning" },
  diarizing: { label: "Diarisation", variant: "default" },
  transcribing: { label: "Transcription", variant: "default" },
  aligning: { label: "Alignement", variant: "default" },
  consent_check: { label: "Vérification consentement", variant: "warning" },
  completed: { label: "Terminé", variant: "success" },
  error: { label: "Erreur", variant: "destructive" },
};

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (status === "consent_check") return <ShieldCheck className="w-4 h-4 text-amber-500" />;
  if (status === "error") return <AlertCircle className="w-4 h-4 text-red-500" />;
  if (["queued", "converting", "diarizing", "transcribing", "aligning"].includes(status))
    return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
  return null;
}

export function JobList({ jobs, onSelect, onDelete, onProcess }: JobListProps) {
  if (jobs.length === 0) return null;

  return (
    <div className="bg-background rounded-xl border border-border overflow-x-auto max-w-full">
      <table className="w-full text-sm min-w-[320px] sm:min-w-[480px]">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left py-3 px-2 sm:px-4 font-medium">Titre</th>
            <th className="text-left py-3 px-2 sm:px-4 font-medium">Statut</th>
            <th className="text-left py-3 px-2 sm:px-4 font-medium hidden md:table-cell">Durée</th>
            <th className="text-left py-3 px-2 sm:px-4 font-medium hidden md:table-cell">Taille</th>
            <th className="text-left py-3 px-2 sm:px-4 font-medium hidden sm:table-cell">Date</th>
            <th className="text-right py-3 px-2 sm:px-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const st = STATUS_MAP[job.status] ?? { label: job.status, variant: "outline" as const };
            return (
              <tr key={job.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="py-3 px-2 sm:px-4 font-medium max-w-[200px] truncate">{job.title}</td>
                <td className="py-3 px-2 sm:px-4">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={job.status} />
                    <span className="hidden sm:inline"><Badge variant={st.variant}>{st.label}</Badge></span>
                  </div>
                </td>
                <td className="py-3 px-2 sm:px-4 text-muted-foreground hidden md:table-cell">
                  {formatDuration(job.duration_seconds)}
                </td>
                <td className="py-3 px-2 sm:px-4 text-muted-foreground hidden md:table-cell">
                  {formatSize(job.audio_file_size)}
                </td>
                <td className="py-3 px-2 sm:px-4 text-muted-foreground hidden sm:table-cell">
                  {formatDate(job.created_at)}
                </td>
                <td className="py-3 px-2 sm:px-4">
                  <div className="flex items-center justify-end gap-1">
                    {job.status === "queued" && (
                      <Button variant="ghost" size="icon" title="Lancer" onClick={() => onProcess(job.id)}>
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    {(job.status === "completed" || job.status === "consent_check" || ["converting", "diarizing", "transcribing", "aligning"].includes(job.status)) && (
                      <Button variant="ghost" size="icon" title="Voir" onClick={() => onSelect(job)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                    {job.status === "error" && (
                      <Button variant="ghost" size="icon" title="Relancer" onClick={() => onProcess(job.id)}>
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Supprimer" onClick={() => onDelete(job.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
