import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../stores/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Download, Trash2, CheckCircle, XCircle } from "lucide-react";

interface ConsentStatus {
  consent_type: string;
  status: "granted" | "revoked";
  version: string | null;
  timestamp: string;
}

const CONSENT_LABELS: Record<string, string> = {
  terms_of_service: "Conditions d'utilisation",
  data_processing: "Traitement des données",
  voice_recording: "Enregistrement vocal",
  email_notifications: "Notifications par email",
};

export function PrivacyPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: consents = [] } = useQuery<ConsentStatus[]>({
    queryKey: ["privacy", "consents"],
    queryFn: () => api.get("/privacy/consents"),
  });

  const exportData = useMutation({
    mutationFn: () => api.get("/privacy/my-data"),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scribia-donnees-${user?.username ?? "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const deleteData = useMutation({
    mutationFn: () => api.delete("/privacy/my-data"),
    onSuccess: () => {
      setShowDeleteConfirm(false);
      localStorage.removeItem("token");
      window.location.href = "/login";
    },
  });

  const toggleConsent = useMutation({
    mutationFn: ({ type, grant }: { type: string; grant: boolean }) =>
      grant
        ? api.post(`/privacy/consent?consent_type=${type}&version=1.0`)
        : api.delete(`/privacy/consent?consent_type=${type}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["privacy", "consents"] }),
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Confidentialité</h1>
      <p className="text-muted-foreground mb-6">Gérez vos données personnelles et vos consentements (RGPD)</p>

      {/* Consentements */}
      <div className="bg-background rounded-xl border border-border p-6 mb-4">
        <h2 className="text-lg font-semibold mb-4">Consentements</h2>
        <div className="space-y-3">
          {Object.entries(CONSENT_LABELS).map(([key, label]) => {
            const consent = consents.find((c) => c.consent_type === key);
            const isGranted = consent?.status === "granted";
            return (
              <div key={key} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  {isGranted ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm">{label}</span>
                </div>
                <Button
                  variant={isGranted ? "outline" : "default"}
                  size="sm"
                  onClick={() => toggleConsent.mutate({ type: key, grant: !isGranted })}
                  disabled={toggleConsent.isPending}
                >
                  {isGranted ? "Retirer" : "Accepter"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export */}
      <div className="bg-background rounded-xl border border-border p-6 mb-4">
        <h2 className="text-lg font-semibold mb-2">Exporter mes données</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Téléchargez une copie de toutes vos données personnelles (RGPD Art. 15 & 20)
        </p>
        <Button variant="outline" onClick={() => exportData.mutate()} disabled={exportData.isPending}>
          <Download className="w-4 h-4" />
          {exportData.isPending ? "Export en cours..." : "Exporter en JSON"}
        </Button>
      </div>

      {/* Suppression */}
      <div className="bg-background rounded-xl border border-destructive/30 p-6">
        <h2 className="text-lg font-semibold mb-2 text-destructive">Supprimer mes données</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Anonymise définitivement vos données personnelles et désactive votre compte (RGPD Art. 17).
          Cette action est irréversible.
        </p>
        {!showDeleteConfirm ? (
          <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="w-4 h-4" />
            Supprimer mes données
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="destructive" onClick={() => deleteData.mutate()} disabled={deleteData.isPending}>
              {deleteData.isPending ? "Suppression..." : "Confirmer la suppression"}
            </Button>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Annuler
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
