import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import type { SpeakerProfile, SpeakerProfileCreate } from "../../api/types";
import { Mic2, Plus, Trash2, X, Mail, CheckCircle2, Clock, XCircle, UserCheck, ChevronDown, ChevronUp } from "lucide-react";

const CONSENT_LABELS: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  sent:     { label: "Email envoyé",  className: "bg-yellow-50 text-yellow-700", icon: Clock },
  accepted: { label: "Accepté",       className: "bg-green-50 text-green-700",  icon: CheckCircle2 },
  declined: { label: "Refusé",        className: "bg-red-50 text-red-700",      icon: XCircle },
};

const ENROLLMENT_LABELS: Record<string, { label: string; className: string }> = {
  pending_online: { label: "En attente",  className: "bg-yellow-50 text-yellow-700" },
  enrolled:       { label: "Enrollé",     className: "bg-green-50 text-green-700" },
};

function ConsentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const c = CONSENT_LABELS[status];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${c.className}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function EnrollmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const c = ENROLLMENT_LABELS[status];
  if (!c) return null;
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.className}`}>{c.label}</span>
  );
}

const emptyForm: SpeakerProfileCreate = {
  first_name: "",
  last_name: "",
  fonction: "",
  email: "",
  phone_number: "",
};

export function SpeakersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [form, setForm] = useState<SpeakerProfileCreate>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: speakers = [], isLoading } = useQuery<SpeakerProfile[]>({
    queryKey: ["admin", "speakers"],
    queryFn: () => api.get("/speakers"),
  });

  const createSpeaker = useMutation({
    mutationFn: (data: SpeakerProfileCreate) => api.post("/speakers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "speakers"] });
      setShowCreate(false);
      setShowExtra(false);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur"),
  });

  const deleteSpeaker = useMutation({
    mutationFn: (id: string) => api.delete(`/speakers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "speakers"] }),
  });

  const sendConsent = useMutation({
    mutationFn: (id: string) => api.post(`/speakers/${id}/send-consent`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "speakers"] }),
    onError: (err) => alert(err instanceof ApiError ? err.message : "Erreur"),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Intervenants</h1>
          <p className="text-sm text-muted-foreground">
            {speakers.length} intervenant{speakers.length !== 1 ? "s" : ""} — profils vocaux pour l'identification des locuteurs
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvel intervenant
        </button>
      </div>

      <div className="bg-background rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Intervenant</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Consentement</th>
              <th className="text-left px-4 py-3 font-medium">Enrollment voix</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {speakers.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-medium">{s.display_name}</p>
                  {s.fonction && <p className="text-xs text-muted-foreground">{s.fonction}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.email ?? "—"}</td>
                <td className="px-4 py-3"><ConsentBadge status={s.consent_status} /></td>
                <td className="px-4 py-3"><EnrollmentBadge status={s.enrollment_status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    {s.email && s.consent_status !== "accepted" && (
                      <button
                        onClick={() => sendConsent.mutate(s.id)}
                        disabled={sendConsent.isPending}
                        title="Envoyer email de consentement"
                        className="p-1 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                    )}
                    {s.consent_status === "accepted" && !s.enrollment_status && (
                      <button
                        title="Consentement OK — enrollment possible"
                        className="p-1 rounded text-green-600 cursor-default"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => confirm("Supprimer cet intervenant ?") && deleteSpeaker.mutate(s.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {speakers.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Mic2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucun intervenant</p>
            <p className="text-xs mt-1">Créez des profils pour identifier les locuteurs lors de la diarisation</p>
          </div>
        )}
      </div>

      {/* Modal création */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl border border-border p-6 w-full max-w-md shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nouvel intervenant</h2>
              <button onClick={() => { setShowCreate(false); setShowExtra(false); setError(null); }}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Champs obligatoires */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Prénom *</label>
                  <input
                    type="text" value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Nom *</label>
                  <input
                    type="text" value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Champs optionnels */}
              <button
                type="button"
                onClick={() => setShowExtra(!showExtra)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showExtra ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Informations supplémentaires
              </button>

              {showExtra && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Fonction / Rôle</label>
                    <input
                      type="text" value={form.fonction ?? ""}
                      onChange={(e) => setForm({ ...form, fonction: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Email</label>
                    <input
                      type="email" value={form.email ?? ""}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="nécessaire pour l'envoi du lien de consentement"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Téléphone</label>
                    <input
                      type="tel" value={form.phone_number ?? ""}
                      onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                onClick={() => createSpeaker.mutate(form)}
                disabled={!form.first_name || !form.last_name || createSpeaker.isPending}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {createSpeaker.isPending ? "Création..." : "Créer l'intervenant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
