import { useState } from "react";
import { X, UserCheck, Loader2, Mic, ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useContactsForEnrollment, useEnrollContactFromDiarisation } from "@/api/hooks/useSpeakers";
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
  onClose,
  onSuccess,
}: EnrollSpeakerModalProps) {
  const { data: contacts = [], isLoading: loadingContacts } = useContactsForEnrollment();
  const enroll = useEnrollContactFromDiarisation();

  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [computeEmbedding, setComputeEmbedding] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const speakerLabel = speaker.display_name || speaker.speaker_id;

  const selectedContact = contacts.find((c) => c.id === selectedContactId);
  const hasEmailConsent =
    selectedContact?.speaker_profile?.consent_status === "accepted" &&
    selectedContact?.speaker_profile?.consent_type === "email";
  const needsEmailConsent = computeEmbedding && selectedContactId && !hasEmailConsent;

  async function handleSubmit() {
    if (!selectedContactId) return;
    setError(null);
    try {
      await enroll.mutateAsync({
        contact_id: selectedContactId,
        diarisation_speaker_id: speaker.id,
        compute_embedding: computeEmbedding,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-background rounded-t-xl sm:rounded-xl border border-border p-4 sm:p-6 w-full max-w-md shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Lier / Enroller un contact</h2>
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

        {/* Contact selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">
            Contact *
          </label>
          {loadingContacts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement…
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun contact — créez d&apos;abord des contacts dans le module Contacts.
            </p>
          ) : (
            <Select value={selectedContactId} onValueChange={(v) => setSelectedContactId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Choisir un contact —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Choisir un contact —</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name ? `${c.first_name} ${c.name}` : c.name}
                    {c.role ? ` — ${c.role}` : ""}
                    {c.speaker_profile?.enrollment_status === "enrolled" ? " ✓" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Compute embedding checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group mb-4">
          <Checkbox
            checked={computeEmbedding}
            onCheckedChange={(checked) => setComputeEmbedding(!!checked)}
            className="mt-0.5"
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

        {needsEmailConsent && (
          <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              L&apos;enrollment vocal (empreinte biométrique) nécessite un consentement écrit par email.
              {selectedContact?.speaker_profile?.consent_type === "oral_recording"
                ? " Ce contact n'a qu'un consentement oral."
                : " Ce contact n'a pas encore donné son consentement."}
              {" "}Vous pouvez lier le contact sans calculer l&apos;empreinte vocale, ou envoyer d&apos;abord une demande de consentement par email.
            </p>
          </div>
        )}

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
            disabled={!selectedContactId || enroll.isPending || !!needsEmailConsent}
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
