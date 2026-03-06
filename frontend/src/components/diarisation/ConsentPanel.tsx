import { useState } from "react";
import { Shield, Loader2, CheckCircle2, AlertTriangle, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDetectOralConsent, useValidateCollectiveConsent } from "@/api/hooks/useSpeakers";
import { useContactGroups } from "@/api/hooks/useContacts";
import { ApiError } from "@/api/client";
import { api } from "@/api/client";
import type { OralConsentDetection, Contact, ContactGroupDetail } from "@/api/types";

interface ConsentPanelProps {
  jobId: string;
}

export function ConsentPanel({ jobId }: ConsentPanelProps) {
  const detectConsent = useDetectOralConsent();
  const validateConsent = useValidateCollectiveConsent();
  const { data: groups = [] } = useContactGroups();

  const [detection, setDetection] = useState<OralConsentDetection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Contact selection for collective consent
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

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
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedContactIds(new Set(groupContacts.map((c) => c.id)));
  }

  function deselectAll() {
    setSelectedContactIds(new Set());
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
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Consentement RGPD</h3>
      </div>

      {/* Detect button */}
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
          : "Detecter consentement oral"}
      </Button>

      {/* Detection result */}
      {detection && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            detection.detected
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-amber-50 border border-amber-200 text-amber-800"
          }`}
        >
          {detection.detected ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Consentement oral detecte
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
                  a {Math.floor(detection.start_time / 60)}:{String(Math.floor(detection.start_time % 60)).padStart(2, "0")}
                </p>
              )}
              {detection.explanation && (
                <p className="text-xs opacity-75">{detection.explanation}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {detection.explanation || "Aucune phrase de consentement detectee dans la transcription."}
            </div>
          )}
        </div>
      )}

      {/* Contact selector for collective consent */}
      {showContactSelector && detection?.detected && (
        <div className="border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">
              Valider le consentement collectif
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Selectionnez le groupe de contacts presents lors de cet enregistrement.
            Tous les contacts selectionnes seront tagges comme ayant consenti.
          </p>

          {/* Group selector */}
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

          {/* Contact list */}
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
                  onClick={selectAll}
                  className="text-primary hover:underline"
                >
                  Tout selectionner
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  onClick={deselectAll}
                  className="text-primary hover:underline"
                >
                  Tout deselectionner
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
                    <input
                      type="checkbox"
                      checked={selectedContactIds.has(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="rounded"
                    />
                    <span>{c.name}</span>
                    {c.role && (
                      <span className="text-xs text-muted-foreground">
                        ({c.role})
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Validate button */}
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

      {/* Error / Success */}
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
