import { useState } from "react";
import { X, UserPlus, Loader2, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useContactsForEnrollment, useEnrollFromSegment } from "@/api/hooks/useSpeakers";
import { ApiError } from "@/api/client";
import type { DiarisationSegment } from "@/api/types";

interface Props {
  segments: DiarisationSegment[];
  jobId: string;
  timeRange?: { start: number; end: number };
  onClose: () => void;
  onSuccess: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function EnrollFromSelectionModal({ segments, jobId, timeRange, onClose, onSuccess }: Props) {
  const { data: contacts = [], isLoading: loadingContacts } = useContactsForEnrollment();
  const enroll = useEnrollFromSegment();

  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fonction, setFonction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Use proportional time range from text selection if available, otherwise full segment bounds
  const startTime = timeRange?.start ?? Math.min(...segments.map((s) => s.start_time));
  const endTime = timeRange?.end ?? Math.max(...segments.map((s) => s.end_time));
  const duration = endTime - startTime;
  const tooShort = duration < 5;

  const selectedContact = contacts.find((c) => c.id === selectedContactId);
  const hasEmailConsent =
    mode === "existing" &&
    selectedContact?.speaker_profile?.consent_status === "accepted" &&
    selectedContact?.speaker_profile?.consent_type === "email";
  const needsEmailConsent =
    (mode === "create") ||
    (mode === "existing" && selectedContactId && !hasEmailConsent);

  async function handleSubmit() {
    setError(null);
    try {
      const body =
        mode === "existing"
          ? (() => {
              const contact = contacts.find((c) => c.id === selectedContactId);
              if (contact?.speaker_profile?.profile_id) {
                return { start_time: startTime, end_time: endTime, speaker_profile_id: contact.speaker_profile.profile_id, contact_id: contact.id };
              }
              const parts = (contact?.name ?? "").split(" ", 2);
              return { start_time: startTime, end_time: endTime, first_name: parts[0], last_name: parts[1] ?? parts[0], contact_id: contact?.id };
            })()
          : {
              start_time: startTime,
              end_time: endTime,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              fonction: fonction.trim() || undefined,
            };
      const result = await enroll.mutateAsync({ jobId, body });
      setSuccess(result.message);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    }
  }

  const canSubmit =
    !tooShort &&
    !enroll.isPending &&
    !success &&
    !needsEmailConsent &&
    (mode === "existing" ? !!selectedContactId : firstName.trim() && lastName.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-background rounded-t-xl sm:rounded-xl border border-border p-4 sm:p-6 w-full max-w-md shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Enroller depuis la selection</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time range info */}
        <div className="bg-muted/50 rounded-lg px-3 py-2 mb-4 text-sm">
          <div className="flex items-center justify-between">
            <span>
              {segments.length} segment{segments.length > 1 ? "s" : ""} :{" "}
              <span className="font-mono font-medium">
                {formatTime(startTime)} - {formatTime(endTime)}
              </span>
            </span>
            <span className="font-medium">{duration.toFixed(1)}s</span>
          </div>
          {tooShort && (
            <div className="flex items-center gap-1.5 text-amber-600 mt-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-xs">Minimum 5 secondes requis</span>
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode("existing")}
            className={`flex-1 text-sm py-1.5 rounded-lg border transition-colors ${
              mode === "existing"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            Profil existant
          </button>
          <button
            onClick={() => setMode("create")}
            className={`flex-1 text-sm py-1.5 rounded-lg border transition-colors ${
              mode === "create"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            Nouveau profil
          </button>
        </div>

        {/* Existing profile selector */}
        {mode === "existing" && (
          <div className="mb-4">
            {loadingContacts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement...
              </div>
            ) : contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun contact. Créez d&apos;abord des contacts dans le module Contacts.
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
        )}

        {/* Create new profile */}
        {mode === "create" && (
          <div className="space-y-3 mb-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium">Prenom *</label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jean"
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium">Nom *</label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="DUPONT"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Fonction</label>
              <Input
                value={fonction}
                onChange={(e) => setFonction(e.target.value)}
                placeholder="Maire, Directeur..."
                className="mt-1"
              />
            </div>
          </div>
        )}

        {needsEmailConsent && (
          <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              {mode === "create"
                ? "L'enrollment vocal nécessite un consentement écrit (email). Créez d'abord le contact dans le module Contacts, puis envoyez-lui une demande de consentement par email avant de l'enroller."
                : "L'enrollment vocal (empreinte biométrique) nécessite un consentement écrit par email. Envoyez d'abord une demande de consentement par email à ce contact."}
            </p>
          </div>
        )}

        {/* Error / Success */}
        {error && <p className="text-sm text-destructive mb-4">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 text-sm text-green-600 mb-4">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {enroll.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {enroll.isPending ? "Enrollment en cours..." : "Enroller"}
          </Button>
        </div>
      </div>
    </div>
  );
}
