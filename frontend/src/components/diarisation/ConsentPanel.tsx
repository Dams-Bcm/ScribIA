import { useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Users,
  Mail,
  Mic,
  Play,
  XCircle,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDetectOralConsent, useValidateCollectiveConsent } from "@/api/hooks/useSpeakers";
import { useContactGroups } from "@/api/hooks/useContacts";
import { useAttendees, useSetAttendees } from "@/api/hooks/useConsent";
import { ApiError } from "@/api/client";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";
import type { OralConsentDetection, Contact, ContactGroupDetail, AttendeeEntry } from "@/api/types";

interface ConsentPanelProps {
  jobId: string;
  /** Hide oral consent detection section (e.g. when transcription is not yet completed) */
  hideOralDetection?: boolean;
  /** Compact bar mode for completed transcriptions */
  compact?: boolean;
  /** Callback to launch full transcription (when all consents are OK) */
  onLaunchTranscription?: (numSpeakers?: number | null) => void;
  launchPending?: boolean;
  /** Callback to verify oral consent (partial analysis) */
  onVerifyOralConsent?: (numSpeakers?: number | null) => void;
  verifyPending?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  accepted_email: { label: "Email", color: "text-green-600" },
  accepted_oral: { label: "Oral", color: "text-green-600" },
  pending_oral: { label: "Oral en attente", color: "text-amber-600" },
  pending: { label: "En attente", color: "text-gray-500" },
  refused: { label: "Refusé", color: "text-red-600" },
  withdrawn: { label: "Retiré", color: "text-red-600" },
};

export function ConsentPanel({ jobId, hideOralDetection, compact, onLaunchTranscription, launchPending, onVerifyOralConsent, verifyPending }: ConsentPanelProps) {
  const detectConsent = useDetectOralConsent();
  const validateConsent = useValidateCollectiveConsent();
  const { data: groups = [] } = useContactGroups();
  const { data: attendeesData, isLoading: loadingAttendees } = useAttendees(jobId);
  const setAttendees = useSetAttendees();

  const [detection, setDetection] = useState<OralConsentDetection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Attendees selection
  const [attendeeGroupId, setAttendeeGroupId] = useState<string | null>(null);
  const [attendeeContacts, setAttendeeContacts] = useState<Contact[]>([]);
  const [loadingAttendeeContacts, setLoadingAttendeeContacts] = useState(false);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(new Set());

  // Num speakers hint (optional)
  const [numSpeakers, setNumSpeakers] = useState<string>("");

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

  // ════════════════════════════════════════════════════════════════════════
  // COMPACT MODE: inline chip with expandable dropdown
  // ════════════════════════════════════════════════════════════════════════
  if (compact) {
    const oralCount = attendees.filter((a) => a.status === "accepted_oral").length;
    const emailCount = attendees.filter((a) => a.status === "accepted_email").length;
    const pendingCount = attendees.filter((a) => a.status === "pending_oral" || a.status === "pending").length;
    const refusedCount = attendees.filter((a) => a.status === "refused" || a.status === "withdrawn").length;

    const chipStatus: "ok" | "pending" | "blocked" =
      refusedCount > 0 ? "blocked" : pendingCount > 0 ? "pending" : "ok";

    const chipStyles = {
      ok: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20",
      pending: "text-amber-500 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20",
      blocked: "text-red-500 bg-red-500/10 border-red-500/20 hover:bg-red-500/20",
    };
    const chipIcons = {
      ok: <ShieldCheck className="w-3.5 h-3.5" />,
      pending: <ShieldAlert className="w-3.5 h-3.5" />,
      blocked: <XCircle className="w-3.5 h-3.5" />,
    };

    const chipLabel =
      chipStatus === "ok"
        ? `${oralCount + emailCount} consentement${oralCount + emailCount > 1 ? "s" : ""}`
        : chipStatus === "pending"
          ? `${pendingCount} en attente`
          : `${refusedCount} refusé${refusedCount > 1 ? "s" : ""}`;

    return (
      <div className="relative">
        {/* ── Chip button ─────────────────────────────────────────────── */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
            chipStyles[chipStatus],
          )}
        >
          {chipIcons[chipStatus]}
          <span className="hidden sm:inline">{chipLabel}</span>
          <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
        </button>

        {/* ── Dropdown panel ──────────────────────────────────────────── */}
        {expanded && (
          <div className="absolute right-0 top-full mt-2 z-50 w-[420px] max-w-[90vw] bg-popover border border-border rounded-lg shadow-lg">
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Current attendees */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Participants ({attendees.length})
                </p>
                {loadingAttendees ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Chargement...
                  </div>
                ) : hasAttendees ? (
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {attendees.map((a) => (
                      <AttendeeRow key={a.contact_id} attendee={a} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun participant défini.</p>
                )}
                {attendeesData?.recording_validity && (
                  <div className="mt-2">
                    <RecordingValidityBadge validity={attendeesData.recording_validity} />
                  </div>
                )}
              </div>

              {/* Modifier les participants */}
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" />
                  Modifier les participants
                </p>
                <div className="space-y-2.5">
                  <Select
                    value={attendeeGroupId || ""}
                    onValueChange={(v) => handleAttendeeGroupChange(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="-- Choisir un groupe --" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Choisir un groupe --</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} ({g.contact_count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {loadingAttendeeContacts && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Chargement...
                    </div>
                  )}

                  {attendeeContacts.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex gap-2 text-xs">
                        <button onClick={() => setSelectedAttendeeIds(new Set(attendeeContacts.map((c) => c.id)))} className="text-primary hover:underline">Tout</button>
                        <span className="text-muted-foreground">|</span>
                        <button onClick={() => setSelectedAttendeeIds(new Set())} className="text-primary hover:underline">Aucun</button>
                        <span className="ml-auto text-muted-foreground">{selectedAttendeeIds.size}/{attendeeContacts.length}</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-0.5">
                        {attendeeContacts.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                            <Checkbox checked={selectedAttendeeIds.has(c.id)} onCheckedChange={() => toggleAttendee(c.id)} />
                            <span className="truncate">{c.name}</span>
                            {c.role && <span className="text-xs text-muted-foreground hidden sm:inline">({c.role})</span>}
                            {c.consent_status === "accepted" && (
                              <span className="ml-auto" title="Consentement email valide"><Mail className="w-3 h-3 text-green-500" /></span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button size="sm" onClick={handleSetAttendees} disabled={selectedAttendeeIds.size === 0 || setAttendees.isPending}>
                    {setAttendees.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                    Définir {selectedAttendeeIds.size} participant{selectedAttendeeIds.size > 1 ? "s" : ""}
                  </Button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {success}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // FULL MODE (pre-processing / waiting for attendees) — 2-column layout
  // ════════════════════════════════════════════════════════════════════════

  const hasPendingOral = attendees.some((a) => a.status === "pending_oral");
  const hasRefused = attendees.some((a) => a.status === "refused" || a.status === "withdrawn");
  const allAccepted = attendees.length > 0 && attendees.every((a) =>
    a.status === "accepted_email" || a.status === "accepted_oral"
  );
  const emailCount = attendees.filter((a) => a.status === "accepted_email").length;
  const oralAcceptedCount = attendees.filter((a) => a.status === "accepted_oral").length;
  const pendingCount = attendees.filter((a) => a.status === "pending_oral" || a.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Left column: Participants selector ──────────────────────────── */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2.5 bg-muted/30 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Participants</span>
          </div>
          <div className="p-3 space-y-3">
            <Select
              value={attendeeGroupId || ""}
              onValueChange={(v) => handleAttendeeGroupChange(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="-- Choisir un groupe --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">-- Choisir un groupe --</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({g.contact_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {loadingAttendeeContacts && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement...
              </div>
            )}

            {attendeeContacts.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setSelectedAttendeeIds(new Set(attendeeContacts.map((c) => c.id)))} className="text-primary hover:underline">Tout</button>
                  <span className="text-muted-foreground">|</span>
                  <button onClick={() => setSelectedAttendeeIds(new Set())} className="text-primary hover:underline">Aucun</button>
                  <span className="ml-auto text-muted-foreground">{selectedAttendeeIds.size}/{attendeeContacts.length}</span>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {attendeeContacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox checked={selectedAttendeeIds.has(c.id)} onCheckedChange={() => toggleAttendee(c.id)} />
                      <span className="truncate">{c.name}</span>
                      {c.role && <span className="text-xs text-muted-foreground hidden sm:inline">({c.role})</span>}
                      {c.consent_status === "accepted" && (
                        <span className="ml-auto flex-shrink-0" title="Consentement email valide">
                          <Mail className="w-3 h-3 text-green-500" />
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button size="sm" onClick={handleSetAttendees} disabled={selectedAttendeeIds.size === 0 || setAttendees.isPending}>
              {setAttendees.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Définir {selectedAttendeeIds.size} participant{selectedAttendeeIds.size > 1 ? "s" : ""}
            </Button>
          </div>
        </div>

        {/* ── Right column: Consent status + actions ──────────────────────── */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2.5 bg-muted/30 border-b border-border flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consentement RGPD</span>
          </div>
          <div className="p-3 space-y-3">
            {/* Consent summary badges */}
            {hasAttendees && (
              <div className="flex gap-2 flex-wrap">
                {emailCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    {emailCount} email
                  </span>
                )}
                {oralAcceptedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <Mic className="w-3 h-3" />
                    {oralAcceptedCount} oral
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    {pendingCount} oral requis
                  </span>
                )}
              </div>
            )}

            {/* Attendee list with status */}
            {loadingAttendees && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Chargement...
              </div>
            )}

            {hasAttendees ? (
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {attendees.map((a) => (
                  <AttendeeRow key={a.contact_id} attendee={a} />
                ))}
              </div>
            ) : !loadingAttendees && (
              <p className="text-xs text-muted-foreground">
                Aucun participant défini. Sélectionnez un groupe à gauche.
              </p>
            )}

            {attendeesData?.recording_validity && (
              <RecordingValidityBadge validity={attendeesData.recording_validity} />
            )}

            {/* ── Num speakers hint ────────────────────────────────────── */}
            {hasAttendees && !hasRefused && (
              <div className="border-t border-border pt-3">
                <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-2.5">
                  <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-medium text-muted-foreground">
                      Nombre d'intervenants <span className="text-muted-foreground/60">(optionnel)</span>
                    </label>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Laisser vide pour détection automatique
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="Auto"
                    value={numSpeakers}
                    onChange={(e) => setNumSpeakers(e.target.value)}
                    className="w-16 px-2 py-1.5 text-center text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {/* ── Action buttons ──────────────────────────────────────────── */}
            {hasAttendees && (
              <div className="border-t border-border pt-3 space-y-2">
                {hasRefused && (
                  <p className="text-sm text-red-600">
                    Un ou plusieurs participants ont refusé. La transcription est bloquée.
                  </p>
                )}

                {allAccepted && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5">
                      <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium">Tous les consentements validés</span>
                        <span className="block text-xs text-green-600 mt-0.5">
                          {emailCount > 0 && `${emailCount} email`}
                          {emailCount > 0 && oralAcceptedCount > 0 && ", "}
                          {oralAcceptedCount > 0 && `${oralAcceptedCount} oral`}
                        </span>
                      </div>
                    </div>
                    {onLaunchTranscription && (
                      <Button onClick={() => onLaunchTranscription(numSpeakers ? parseInt(numSpeakers, 10) : null)} disabled={launchPending} className="w-full">
                        {launchPending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Lancement…</>
                        ) : (
                          <><Play className="w-4 h-4" /> Lancer la transcription + diarisation</>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {!hasRefused && !allAccepted && hasPendingOral && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <strong>{pendingCount} participant{pendingCount > 1 ? "s" : ""}</strong> sans consentement email.
                      Le consentement oral sera vérifié automatiquement dans les 60 premières secondes,
                      puis la transcription complète se lancera si le consentement est détecté.
                    </p>
                    {onVerifyOralConsent && (
                      <Button size="sm" onClick={() => onVerifyOralConsent(numSpeakers ? parseInt(numSpeakers, 10) : null)} disabled={verifyPending}>
                        {verifyPending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Lancement…</>
                        ) : (
                          <><Play className="w-4 h-4" /> Lancer transcription</>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {!hasRefused && !allAccepted && !hasPendingOral && (
                  <p className="text-xs text-muted-foreground">
                    Consentements en attente de validation.
                  </p>
                )}
              </div>
            )}

            {/* ── Oral consent detection (post-transcription) ─────────────── */}
            {!hideOralDetection && hasPendingOral && (
              <div className="border-t border-border pt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Consentement oral</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleDetect} disabled={detectConsent.isPending}>
                  {detectConsent.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {detectConsent.isPending ? "Analyse en cours..." : "Détecter consentement oral"}
                </Button>
                {detection && <DetectionResult detection={detection} jobId={jobId} />}
                {showContactSelector && detection?.detected && detection.detection_type !== "individual_refusal" && (
                  <CollectiveConsentSelector
                    groups={groups}
                    selectedGroupId={selectedGroupId}
                    groupContacts={groupContacts}
                    loadingContacts={loadingContacts}
                    selectedContactIds={selectedContactIds}
                    onGroupChange={handleGroupChange}
                    onToggleContact={toggleContact}
                    onSelectAll={() => setSelectedContactIds(new Set(groupContacts.map((c) => c.id)))}
                    onDeselectAll={() => setSelectedContactIds(new Set())}
                    onValidate={handleValidate}
                    isPending={validateConsent.isPending}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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

function DetectionResult({ detection, jobId }: { detection: OralConsentDetection; jobId: string }) {
  return (
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
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{detection.explanation ||
            "Aucune phrase de consentement détectée dans la transcription."}</span>
        </div>
      )}
    </div>
  );
}

function CollectiveConsentSelector({
  groups,
  selectedGroupId,
  groupContacts,
  loadingContacts,
  selectedContactIds,
  onGroupChange,
  onToggleContact,
  onSelectAll,
  onDeselectAll,
  onValidate,
  isPending,
}: {
  groups: { id: string; name: string; contact_count: number }[];
  selectedGroupId: string | null;
  groupContacts: Contact[];
  loadingContacts: boolean;
  selectedContactIds: Set<string>;
  onGroupChange: (id: string) => void;
  onToggleContact: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onValidate: () => void;
  isPending: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4" />
        <span className="text-sm font-medium">Valider le consentement collectif</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Confirmez que le consentement oral couvre bien chaque participant sélectionné.
      </p>

      <Select
        value={selectedGroupId || ""}
        onValueChange={(v) => onGroupChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="-- Choisir un groupe de contacts --" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">-- Choisir un groupe de contacts --</SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name} ({g.contact_count} contacts)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loadingContacts && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement...
        </div>
      )}

      {groupContacts.length > 0 && (
        <div className="space-y-1">
          <div className="flex gap-2 text-xs">
            <button onClick={onSelectAll} className="text-primary hover:underline">Tout sélectionner</button>
            <span className="text-muted-foreground">|</span>
            <button onClick={onDeselectAll} className="text-primary hover:underline">Tout désélectionner</button>
            <span className="ml-auto text-muted-foreground">{selectedContactIds.size}/{groupContacts.length}</span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {groupContacts.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                <Checkbox checked={selectedContactIds.has(c.id)} onCheckedChange={() => onToggleContact(c.id)} />
                <span>{c.name}</span>
                {c.role && <span className="text-xs text-muted-foreground">({c.role})</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      <Button size="sm" onClick={onValidate} disabled={selectedContactIds.size === 0 || isPending}>
        {isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
        Valider le consentement ({selectedContactIds.size} contact{selectedContactIds.size > 1 ? "s" : ""})
      </Button>
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
              <div className="flex flex-wrap gap-2">
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
              <div className="flex items-start gap-1.5">
                <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="text-sm">
                  Le locuteur qui a refusé n'a pas pu être identifié.
                </span>
              </div>
              {!identifiedManually ? (
                <div className="flex flex-wrap gap-2">
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
                  <div className="flex flex-wrap gap-2">
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
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>La personne a quitté la salle. L'enregistrement reste valide pour les autres participants.</span>
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
