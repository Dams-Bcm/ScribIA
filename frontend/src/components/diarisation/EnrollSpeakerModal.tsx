import { useState } from "react";
import { X, UserCheck, Loader2, Mic } from "lucide-react";
import { useSpeakers, useEnrollFromDiarisation } from "@/api/hooks/useSpeakers";
import { ApiError } from "@/api/client";
import type { DiarisationSpeaker } from "@/api/types";

interface EnrollSpeakerModalProps {
  speaker: DiarisationSpeaker;
  jobId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EnrollSpeakerModal({
  speaker,
  jobId,
  onClose,
  onSuccess,
}: EnrollSpeakerModalProps) {
  const { data: profiles = [], isLoading: loadingProfiles } = useSpeakers();
  const enroll = useEnrollFromDiarisation();

  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    speaker.profile_id ?? "",
  );
  const [computeEmbedding, setComputeEmbedding] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const speakerLabel = speaker.display_name || speaker.speaker_id;

  async function handleSubmit() {
    if (!selectedProfileId) return;
    setError(null);
    try {
      await enroll.mutateAsync({
        profileId: selectedProfileId,
        body: {
          job_id: jobId,
          diarisation_speaker_id: speaker.id,
          compute_embedding: computeEmbedding,
        },
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl border border-border p-6 w-full max-w-md shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Lier / Enroller un intervenant</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Locuteur détecté :{" "}
          <span className="font-medium text-foreground">{speakerLabel}</span>
          <span className="ml-2 text-xs">
            ({speaker.segment_count} segments)
          </span>
        </p>

        {/* Profile selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">
            Profil intervenant *
          </label>
          {loadingProfiles ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement…
            </div>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun intervenant créé — créez d&apos;abord un profil dans Administration &gt; Intervenants.
            </p>
          ) : (
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Choisir un intervenant —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? `${p.first_name} ${p.last_name}`}
                  {p.fonction ? ` — ${p.fonction}` : ""}
                  {p.enrollment_status === "enrolled" ? " ✓" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Compute embedding checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group mb-4">
          <input
            type="checkbox"
            checked={computeEmbedding}
            onChange={(e) => setComputeEmbedding(e.target.checked)}
            className="mt-0.5 rounded border-input"
          />
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium group-hover:text-primary transition-colors">
              <Mic className="w-3.5 h-3.5" />
              Calculer l&apos;empreinte vocale
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Utilise tous les segments de ce locuteur pour construire un profil
              vocal. Nécessite que le modèle pyannote soit disponible.
              {speaker.segment_count > 0 && (
                <> {speaker.segment_count} segment{speaker.segment_count > 1 ? "s" : ""} seront analysés.</>
              )}
            </p>
          </div>
        </label>

        {error && (
          <p className="text-sm text-destructive mb-4">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedProfileId || enroll.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {enroll.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {enroll.isPending
              ? computeEmbedding
                ? "Calcul en cours…"
                : "Liaison en cours…"
              : computeEmbedding
                ? "Lier et enroller"
                : "Lier uniquement"}
          </button>
        </div>
      </div>
    </div>
  );
}
