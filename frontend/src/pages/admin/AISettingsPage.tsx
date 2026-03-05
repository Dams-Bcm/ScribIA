import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Save, Download, Trash2, Loader2, Check, AlertCircle } from "lucide-react";

interface AIUsage {
  usage_key: string;
  label: string;
  model_name: string | null;
}

interface AISettingsResponse {
  usages: AIUsage[];
  ollama_models: string[];
  default_model: string;
  ollama_url: string;
}

function useAISettings() {
  return useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api.get<AISettingsResponse>("/admin/ai-settings"),
  });
}

function useUpdateAISettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { usage_key: string; model_name: string | null }[]) =>
      api.put("/admin/ai-settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-settings"] }),
  });
}

function usePullModel() {
  return useMutation({
    mutationFn: async (modelName: string) => {
      const response = await fetch(`/api/ai-documents/ollama-models/pull?model=${encodeURIComponent(modelName)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) throw new Error("Pull failed");
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let lastStatus = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              lastStatus = data.status || lastStatus;
            } catch { /* skip */ }
          }
        }
      }
      return lastStatus;
    },
  });
}

function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.delete(`/ai-documents/ollama-models/${encodeURIComponent(name)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-settings"] }),
  });
}

export function AISettingsPage() {
  const { data, isLoading } = useAISettings();
  const updateSettings = useUpdateAISettings();
  const pullModel = usePullModel();
  const deleteModel = useDeleteModel();

  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [pullName, setPullName] = useState("");
  const [saved, setSaved] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  function getModelForUsage(usage: AIUsage): string | null {
    if (usage.usage_key in overrides) return overrides[usage.usage_key];
    return usage.model_name;
  }

  function handleModelChange(usageKey: string, value: string) {
    setOverrides({ ...overrides, [usageKey]: value === "__default__" ? null : value });
    setSaved(false);
  }

  async function handleSave() {
    const body = data!.usages.map((u) => ({
      usage_key: u.usage_key,
      model_name: u.usage_key in overrides ? overrides[u.usage_key] : u.model_name,
    }));
    await updateSettings.mutateAsync(body);
    setOverrides({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handlePull() {
    if (!pullName.trim()) return;
    await pullModel.mutateAsync(pullName.trim());
    setPullName("");
  }

  const hasChanges = Object.keys(overrides).length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Gestion IA</h1>
        <p className="text-sm text-muted-foreground">
          Configurez les modèles Ollama utilisés par chaque module
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Model assignments */}
        <div className="space-y-6">
          <div className="bg-background rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Affectation des modèles</h2>
              <Button size="sm" onClick={handleSave} disabled={!hasChanges && !saved || updateSettings.isPending}>
                {saved ? (
                  <><Check className="w-4 h-4 mr-1" /> Sauvegardé</>
                ) : updateSettings.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sauvegarde…</>
                ) : (
                  <><Save className="w-4 h-4 mr-1" /> Sauvegarder</>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              Modèle par défaut : <span className="font-mono font-medium text-foreground">{data.default_model}</span>
              <span className="ml-2">({data.ollama_url})</span>
            </p>

            <div className="space-y-4">
              {data.usages.map((usage) => {
                const currentModel = getModelForUsage(usage);
                return (
                  <div key={usage.usage_key} className="flex items-center gap-4">
                    <div className="w-60 shrink-0">
                      <Label className="text-sm font-medium">{usage.label}</Label>
                      <p className="text-xs text-muted-foreground">{usage.usage_key}</p>
                    </div>
                    <Select
                      value={currentModel ?? "__default__"}
                      onValueChange={(v) => handleModelChange(usage.usage_key, v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">
                          Par défaut ({data.default_model})
                        </SelectItem>
                        {data.ollama_models.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right panel: models management */}
        <div className="space-y-6">
          {/* Pull model */}
          <div className="bg-background rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Télécharger un modèle</h3>
            <div className="flex gap-2">
              <Input
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                placeholder="ex: llama3.1:70b"
                className="text-sm"
                onKeyDown={(e) => e.key === "Enter" && handlePull()}
              />
              <Button size="sm" onClick={handlePull} disabled={!pullName.trim() || pullModel.isPending}>
                {pullModel.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </Button>
            </div>
            {pullModel.isPending && (
              <p className="text-xs text-muted-foreground mt-2">Téléchargement en cours… (peut prendre plusieurs minutes)</p>
            )}
            {pullModel.isSuccess && (
              <p className="text-xs text-green-600 mt-2">Modèle téléchargé avec succès</p>
            )}
            {pullModel.isError && (
              <p className="text-xs text-destructive mt-2">Erreur lors du téléchargement</p>
            )}
          </div>

          {/* Installed models */}
          <div className="bg-background rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Modèles installés</h3>
            {data.ollama_models.length === 0 ? (
              <div className="text-center py-4">
                <AlertCircle className="w-6 h-6 mx-auto mb-1 text-muted-foreground opacity-40" />
                <p className="text-xs text-muted-foreground">Aucun modèle installé ou Ollama inaccessible</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.ollama_models.map((m) => (
                  <div key={m} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-mono truncate">{m}</span>
                      {m === data.default_model && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">défaut</span>
                      )}
                    </div>
                    <button
                      onClick={() => { if (confirm(`Supprimer le modèle ${m} ?`)) deleteModel.mutate(m); }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
