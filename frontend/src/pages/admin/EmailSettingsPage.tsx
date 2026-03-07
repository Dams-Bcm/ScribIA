import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Loader2, Check, SendHorizonal, CheckCircle2, XCircle, Mail } from "lucide-react";

interface EmailSetting {
  key: string;
  label: string;
  value: string;
  default: string;
}

interface EmailSettingsResponse {
  settings: EmailSetting[];
}

function useEmailSettings() {
  return useQuery({
    queryKey: ["email-settings"],
    queryFn: () => api.get<EmailSettingsResponse>("/admin/email-settings"),
  });
}

function useUpdateEmailSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; value: string }[]) =>
      api.put("/admin/email-settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-settings"] }),
  });
}

function useTestEmail() {
  return useMutation({
    mutationFn: () => api.post<{ success: boolean; message?: string; error?: string }>("/admin/email-settings/test"),
  });
}

export function EmailSettingsPage() {
  const { data, isLoading } = useEmailSettings();
  const updateEmail = useUpdateEmailSettings();
  const testEmail = useTestEmail();

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasChanges = Object.keys(overrides).length > 0;

  async function handleSave() {
    const body = data!.settings.map((s) => ({
      key: s.key,
      value: overrides[s.key] ?? s.value,
    }));
    await updateEmail.mutateAsync(body);
    setOverrides({});
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    setTestResult(null);
    try {
      const res = await testEmail.mutateAsync();
      setTestResult({ success: res.success, message: res.message || res.error || "" });
    } catch {
      setTestResult({ success: false, message: "Erreur lors du test" });
    }
  }

  const descriptions: Record<string, string> = {
    smtp_host: "Adresse du serveur SMTP (ex: smtp.gmail.com, smtp.office365.com)",
    smtp_port: "Port SMTP — 587 pour STARTTLS (recommandé), 465 pour SSL, 25 pour non chiffré",
    smtp_user: "Identifiant de connexion SMTP (souvent l'adresse email)",
    smtp_password: "Mot de passe ou mot de passe d'application SMTP",
    smtp_from_email: "Adresse email qui apparaîtra comme expéditeur",
    smtp_from_name: "Nom affiché comme expéditeur dans les clients mail",
    smtp_use_tls: "Activer STARTTLS pour chiffrer la connexion (recommandé)",
    app_base_url: "URL publique de l'application, utilisée pour les liens dans les emails de consentement",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Configuration Email (SMTP)</h1>
          <p className="text-sm text-muted-foreground">
            Configurez le serveur SMTP pour l'envoi des emails de consentement RGPD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={testEmail.isPending}
          >
            {testEmail.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Test…</>
            ) : (
              <><SendHorizonal className="w-4 h-4 mr-1" /> Tester</>
            )}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges && !saved || updateEmail.isPending}>
            {saved ? (
              <><Check className="w-4 h-4 mr-1" /> Sauvegardé</>
            ) : updateEmail.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sauvegarde…</>
            ) : (
              <><Save className="w-4 h-4 mr-1" /> Sauvegarder</>
            )}
          </Button>
        </div>
      </div>

      <div className="bg-background rounded-xl border border-border p-6">
        {testResult && (
          <div className={`mb-4 rounded-lg border p-3 text-sm flex items-center gap-2 ${
            testResult.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            {testResult.message}
          </div>
        )}

        <div className="space-y-4">
          {data.settings.map((s) => (
            <div key={s.key}>
              <div className="flex items-center gap-4">
                <div className="w-60 shrink-0">
                  <Label className="text-sm font-medium">{s.label}</Label>
                  <p className="text-xs text-muted-foreground">défaut : {s.default || "(vide)"}</p>
                </div>
                {s.key === "smtp_use_tls" ? (
                  <Select
                    value={overrides[s.key] ?? s.value}
                    onValueChange={(v) => {
                      setOverrides({ ...overrides, [s.key]: v });
                      setSaved(false);
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Oui (STARTTLS)</SelectItem>
                      <SelectItem value="false">Non</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="flex-1 font-mono text-sm"
                    type={s.key === "smtp_password" ? "password" : s.key === "smtp_port" ? "number" : "text"}
                    value={overrides[s.key] ?? s.value}
                    onChange={(e) => {
                      setOverrides({ ...overrides, [s.key]: e.target.value });
                      setSaved(false);
                    }}
                    placeholder={s.default || "(vide)"}
                  />
                )}
              </div>
              {descriptions[s.key] && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{descriptions[s.key]}</p>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Utilisez le bouton <strong>Tester</strong> pour vérifier la configuration (envoie un email à l'adresse expéditeur).
        </p>
      </div>
    </div>
  );
}
