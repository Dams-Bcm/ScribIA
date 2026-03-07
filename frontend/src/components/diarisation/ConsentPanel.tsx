import { useState } from "react";
import {
  Shield,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Users,
  UserPlus,
  Mail,
  Mic,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDetectOralConsent, useValidateCollectiveConsent } from "@/api/hooks/useSpeakers";
import { useContactGroups } from "@/api/hooks/useContacts";
import { useAttendees, useSetAttendees } from "@/api/hooks/useConsent";
import { ApiError } from "@/api/client";
import { api } from "@/api/client";
import type { OralConsentDetection, Contact, ContactGroupDetail, AttendeeEntry } from "@/api/types";

interface ConsentPanelProps {
  jobId: string;
  /** Hide oral consent detection section (e.g. when transcription is not yet completed) */
  hideOralDetection?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  accepted_email: { label: "Email", color: "text-green-600" },
  accepted_oral: { label: "Oral", color: "text-green-600" },
  pending_oral: { label: "Oral en attente", color: "text-amber-600" },
  pending: { label: "En attente", color: "text-gray-500" },
  refused: { label: "Refusé", color: "text-red-600" },
  withdrawn: { label: "Retiré", color: "text-red-600" },
};

export function ConsentPanel({ jobId, hideOralDetection }: ConsentPanelProps) {
  const detectConsent = useDetectOralConsent();
  const validateConsent = useValidateCollectiveConsent();
  const { data: groups = [] } = useContactGroups();
  const { data: attendeesData, isLoading: loadingAttendees } = useAttendees(jobId);
  const setAttendees = useSetAttendees();

  const [detection, setDetection] = useState<OralConsentDetection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Attendees selection
  const [showAttendeeSelector, setShowAttendeeSelector] = useState(false);
  const [attendeeGroupId, setAttendeeGroupId] = useState<string | null>(null);
  const [attendeeContacts, setAttendeeContacts] = useState<Contact[]>([]);
  const [loadingAttendeeContacts, setLoadingAttendeeContacts] = useState(false);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(new Set());

  // Contact selection for collective consent
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  const attendees = attendeesData?.attendees ?? [];
  const hasAttendees = attendees.length > 0;

  // ── Attendees handlers ──────────────────────────────────────────────────

  async function loadAttendeeGroupContacts(groupId: string) {
    setLoadingAttendeeContacts(true);
    try {
      const detail = await api.get<ContactGroupDetail>(`/contacts/groups/${groupId}`);
      setAttendeeContacts(detail.contacts);
      setSelectedAttendeeIds(new Set(detail.contacts.map((c) => c.id)));
    } catch {
      setAttendeeContacts([]);
    } finally {
      setLoadingAttendeeContacts(false);
    }
  }

  function handleAttendeeGroupChange(groupId: string) {
    setAttendeeGroupId(groupId);
    if (groupId) {
      loadAttendeeGroupContacts(groupId);
    } else {
      setAttendeeContacts([]);
      setSelectedAttendeeIds(new Set());
    }
  }

  function toggleAttendee(id: string) {
    setSelectedAttendeeIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSetAttendees() {
    setError(null);
    try {
      const result = await setAttendees.mutateAsync({
        jobId,
        contactIds: Array.from(selectedAttendeeIds),
      });
      setSuccess(result.summary ?? "Participants définis");
      setShowAttendeeSelector(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    }
  }

  // ── Oral consent handlers ─────────────────────────────────────────────

  async function handleDetect() {
    setError(null);
    setSuccess(null);
    setDetection(null);
    try {
      const result = await detectConsent.mutateAsync(jobId);
      setDetection(result);
      if (result.detected) {
        setShowContactSelector(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la detection");
    }
  }

  async function loadGroupContacts(groupId: string) {
    setLoadingContacts(true);
    try {
      const detail = await api.get<ContactGroupDetail>(`/contacts/groups/${groupId}`);
      setGroupContacts(detail.contacts);
      setSelectedContactIds(new Set(detail.contacts.map((c) => c.id)));
    } catch {
      setGroupContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }

  function handleGroupChange(groupId: string) {
    setSelectedGroupId(groupId);
    if (groupId) {
      loadGroupContacts(groupId);
    } else {
      setGroupContacts([]);
      setSelectedContactIds(new Set());
    }
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      next.has(contactId) ? next.delete(contactId) : next.add(contactId);
      return next;
    });
  }

  async function handleValidate() {
    setError(null);
    try {
      const result = await validateConsent.mutateAsync({
        jobId,
        body: {
          consent_segment_id: detection?.segment_id ?? undefined,
          contact_ids: Array.from(selectedContactIds),
        },
      });
      setSuccess(result.message);
      setShowContactSelector(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la validation");
    }
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Consentement RGPD</h3>
      </div>

      {/* ── Section 1: Participants ──────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Participants</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAttendeeSelector(!showAttendeeSelector)}
          >
            <UserPlus className="w-3.5 h-3.5" />
            {hasAttendees ? "Modifier" : "Définir"}
          </Button>
        </div>

        {/* Current attendees summary */}
        {loadingAttendees && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Chargement...
          </div>
        )}

        {hasAttendees && (
          <div className="space-y-1">
            {attendeesData?.summary && (
              <p className="text-xs text-muted-foreground">{attendeesData.summary}</p>
            )}
            {attendeesData?.recording_validity && (
              <RecordingValidityBadge validity={attendeesData.recording_validity} />
            )}
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {attendees.map((a) => (
                <AttendeeRow key={a.contact_id} attendee={a} />
              ))}
            </div>
          </div>
        )}

        {!hasAttendees && !loadingAttendees && (
          <p className="text-xs text-muted-foreground">
            Aucun participant défini. Sélectionnez les contacts présents à cet enregistrement.
          </p>
        )}

        {/* Attendee selector */}
        {showAttendeeSelector && (
          <div className="border border-border rounded-lg p-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Sélectionnez le groupe de contacts puis les participants présents.
              Le système vérifiera automatiquement les consentements email existants.
            </p>

            <select
              value={attendeeGroupId || ""}
              onChange={(e) => handleAttendeeGroupChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">-- Choisir un groupe de contacts --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.contact_count} contacts)
                </option>
              ))}
            </select>

            {loadingAttendeeContacts && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement...
              </div>
            )}

            {attendeeContacts.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setSelectedAttendeeIds(new Set(attendeeContacts.map((c) => c.id)))}
                    className="text-primary hover:underline"
                  >
                    Tout sélectionner
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    onClick={() => setSelectedAttendeeIds(new Set())}
                    className="text-primary hover:underline"
                  >
                    Tout désélectionner
                  </button>
                  <span className="ml-auto text-muted-foreground">
                    {selectedAttendeeIds.size}/{attendeeContacts.length}
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {attendeeContacts.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selectedAttendeeIds.has(c.id)}
                        onCheckedChange={() => toggleAttendee(c.id)}
                      />
                      <span>{c.name}</span>
                      {c.role && (
                        <span className="text-xs text-muted-foreground">({c.role})</span>
                      )}
                      {c.consent_status === "accepted" && (
                        <span className="ml-auto" title="Consentement email valide">
                          <Mail className="w-3 h-3 text-green-500" />
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button
              size="sm"
              onClick={handleSetAttendees}
              disabled={selectedAttendeeIds.size === 0 || setAttendees.isPending}
            >
              {setAttendees.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              )}
              Définir {selectedAttendeeIds.size} participant
              {selectedAttendeeIds.size > 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </div>

      {/* ── Section 2: Oral consent detection ───────────────────────────── */}
      {!hideOralDetection && attendees.some((a) => a.status === "pending_oral") && <div className="border-t border-border pt-3 space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Consentement oral</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleDetect}
          disabled={detectConsent.isPending}
        >
          {detectConsent.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {detectConsent.isPending
            ? "Analyse en cours..."
            : "Détecter consentement oral"}
        </Button>

        {/* Detection result */}
        {detection && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              detection.detected
                ? detection.detection_type === "individual_refusal"
                  ? "bg-red-50 border border-red-200 text-red-800"
                  : "bg-green-50 border border-green-200 text-green-800"
                : "bg-amber-50 border border-amber-200 text-amber-800"
            }`}
          >
            {detection.detected ? (
              detection.detection_type === "individual_refusal" ? (
                <RefusalFlow detection={detection} jobId={jobId} />
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Consentement oral détecté
                    {detection.confidence && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100">
                        {detection.confidence}
                      </span>
                    )}
                  </div>
                  {detection.consent_phrase && (
                    <p className="italic">&laquo; {detection.consent_phrase} &raquo;</p>
                  )}
                  {detection.start_time != null && (
                    <p className="text-xs">
                      à {Math.floor(detection.start_time / 60)}:
                      {String(Math.floor(detection.start_time % 60)).padStart(2, "0")}
                    </p>
                  )}
                  {detection.explanation && (
                    <p className="text-xs opacity-75">{detection.explanation}</p>
                  )}
                </div>
              )
            ) : (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {detection.explanation ||
                  "Aucune phrase de consentement détectée dans la transcription."}
              </div>
            )}
          </div>
        )}

        {/* Contact selector for collective consent */}
        {showContactSelector && detection?.detected && detection.detection_type !== "individual_refusal" && (
          <div className="border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">
                Valider le consentement collectif
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Confirmez que le consentement oral couvre bien chaque participant sélectionné.
            </p>

            <select
              value={selectedGroupId || ""}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">-- Choisir un groupe de contacts --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.contact_count} contacts)
                </option>
              ))}
            </select>

            {loadingContacts && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement...
              </div>
            )}

            {groupContacts.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setSelectedContactIds(new Set(groupContacts.map((c) => c.id)))}
                    className="text-primary hover:underline"
                  >
                    Tout sélectionner
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    onClick={() => setSelectedContactIds(new Set())}
                    className="text-primary hover:underline"
                  >
                    Tout désélectionner
                  </button>
                  <span className="ml-auto text-muted-foreground">
                    {selectedContactIds.size}/{groupContacts.length}
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {groupContacts.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selectedContactIds.has(c.id)}
                        onCheckedChange={() => toggleContact(c.id)}
                      />
                      <span>{c.name}</span>
                      {c.role && (
                        <span className="text-xs text-muted-foreground">({c.role})</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button
              size="sm"
              onClick={handleValidate}
              disabled={selectedContactIds.size === 0 || validateConsent.isPending}
            >
              {validateConsent.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              )}
              Valider le consentement ({selectedContactIds.size} contact
              {selectedContactIds.size > 1 ? "s" : ""})
            </Button>
          </div>
        )}
      </div>}

      {/* ── Error / Success ──────────────────────────────────────────────── */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}
    </div>
  );
}


// ── Sub-components ────────────────────────────────────────────────────────────

function AttendeeRow({ attendee }: { attendee: AttendeeEntry }) {
  const info = STATUS_LABELS[attendee.status] ?? { label: attendee.status, color: "text-gray-500" };
  const icon = attendee.status.includes("email") ? (
    <Mail className="w-3 h-3" />
  ) : (
    <Mic className="w-3 h-3" />
  );

  return (
    <div className="flex items-center gap-2 px-2 py-0.5 text-sm">
      <span className={`flex items-center gap-1 ${info.color}`}>
        {icon}
        <span className="text-xs">{info.label}</span>
      </span>
      <span className="text-muted-foreground">—</span>
      <span className="truncate">{attendee.contact_name || attendee.contact_id}</span>
    </div>
  );
}

function RefusalFlow({
  detection,
  jobId: _jobId,
}: {
  detection: OralConsentDetection;
  jobId: string;
}) {
  const [step, setStep] = useState<"detected" | "left_room" | "invalidated">("detected");
  const [identifiedManually, setIdentifiedManually] = useState(false);

  const speakerName = detection.refusal_speaker_label || detection.refusal_speaker_id;
  const isIdentifiable = !!speakerName;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 font-medium">
        <XCircle className="w-4 h-4" />
        Refus détecté
        {detection.confidence && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100">
            {detection.confidence}
          </span>
        )}
      </div>

      {detection.consent_phrase && (
        <p className="italic">&laquo; {detection.consent_phrase} &raquo;</p>
      )}

      {detection.start_time != null && (
        <p className="text-xs">
          à {Math.floor(detection.start_time / 60)}:
          {String(Math.floor(detection.start_time % 60)).padStart(2, "0")}
        </p>
      )}

      {step === "detected" && (
        <div className="space-y-2 pt-1">
          {isIdentifiable ? (
            <>
              <p className="text-sm font-medium">
                {speakerName} a refusé l'enregistrement. A-t-il/elle quitté la salle ?
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setStep("left_room")}>
                  Oui, a quitté la salle
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setStep("invalidated")}
                >
                  Non, est resté(e)
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm">
                  Le locuteur qui a refusé n'a pas pu être identifié.
                </span>
              </div>
              {!identifiedManually ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIdentifiedManually(true)}
                  >
                    Identifier manuellement
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setStep("invalidated")}
                  >
                    Invalider l'enregistrement
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    Réécoutez le passage et identifiez la personne qui a refusé.
                    A-t-elle quitté la salle après son refus ?
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setStep("left_room")}>
                      Oui, a quitté la salle
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setStep("invalidated")}
                    >
                      Non, est resté(e)
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {step === "left_room" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-green-800 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            La personne a quitté la salle. L'enregistrement reste valide pour les autres participants.
          </div>
          <p className="text-xs mt-1 opacity-75">
            Cette personne sera retirée des participants si elle figurait dans la liste.
          </p>
        </div>
      )}

      {step === "invalidated" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-800 text-sm">
          <div className="flex items-center gap-1.5 font-medium">
            <XCircle className="w-4 h-4" />
            Enregistrement invalidé
          </div>
          <p className="text-xs mt-1">
            Une personne a refusé l'enregistrement et est restée dans la salle.
            Aucun document ne peut être généré à partir de cette session.
          </p>
        </div>
      )}
    </div>
  );
}

function RecordingValidityBadge({ validity }: { validity: string }) {
  const styles: Record<string, string> = {
    valid: "bg-green-100 text-green-800 border-green-200",
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    blocked: "bg-red-100 text-red-800 border-red-200",
    invalidated: "bg-red-100 text-red-800 border-red-200",
  };
  const labels: Record<string, string> = {
    valid: "Enregistrement valide",
    pending: "Consentements en attente",
    blocked: "Enregistrement bloqué",
    invalidated: "Enregistrement invalidé",
  };

  return (
    <span
      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${
        styles[validity] ?? "bg-gray-100 text-gray-800 border-gray-200"
      }`}
    >
      {labels[validity] ?? validity}
    </span>
  );
}
