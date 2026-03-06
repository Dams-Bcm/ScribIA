import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Save, Download, Trash2, Loader2, Check, AlertCircle, Search, Mic } from "lucide-react";

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

interface RAGSetting {
  key: string;
  label: string;
  value: string;
  default: string;
}

interface RAGSettingsResponse {
  settings: RAGSetting[];
  chroma_url: string;
}

interface WhisperSetting {
  key: string;
  label: string;
  value: string;
  default: string;
}

interface WhisperSettingsResponse {
  settings: WhisperSetting[];
  device: string;
}

function useAISettings() {
  return useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api.get<AISettingsResponse>("/admin/ai-settings"),
  });
}

function useRAGSettings() {
  return useQuery({
    queryKey: ["rag-settings"],
    queryFn: () => api.get<RAGSettingsResponse>("/admin/rag-settings"),
  });
}

function useWhisperSettings() {
  return useQuery({
    queryKey: ["whisper-settings"],
    queryFn: () => api.get<WhisperSettingsResponse>("/admin/whisper-settings"),
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

function useUpdateRAGSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; value: string }[]) =>
      api.put("/admin/rag-settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rag-settings"] }),
  });
}

function useUpdateWhisperSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; value: string }[]) =>
      api.put("/admin/whisper-settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whisper-settings"] }),
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
  const { data: ragData } = useRAGSettings();
  const { data: whisperData } = useWhisperSettings();
  const updateSettings = useUpdateAISettings();
  const updateRAG = useUpdateRAGSettings();
  const updateWhisper = useUpdateWhisperSettings();
  const pullModel = usePullModel();
  const deleteModel = useDeleteModel();

  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [ragOverrides, setRAGOverrides] = useState<Record<string, string>>({});
  const [whisperOverrides, setWhisperOverrides] = useState<Record<string, string>>({});
  const [pullName, setPullName] = useState("");
  const [saved, setSaved] = useState(false);
  const [ragSaved, setRAGSaved] = useState(false);
  const [whisperSaved, setWhisperSaved] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  function getModelForUsage(usage: AIUsage): string | null {
    if (usage.usage_key in overrides) return overrides[usage.usage_key] ?? null;
    return usage.model_name;
  }

  function handleModelChange(usageKey: string, value: string) {
    setOverrides({ ...overrides, [usageKey]: value === "__default__" ? null : value });
    setSaved(false);
  }

  async function handleSave() {
    const body = data!.usages.map((u) => ({
      usage_key: u.usage_key,
      model_name: u.usage_key in overrides ? (overrides[u.usage_key] ?? null) : u.model_name,
    }));
    await updateSettings.mutateAsync(body);
    setOverrides({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleRAGSave() {
    const body = Object.entries(ragOverrides).map(([key, value]) => ({ key, value }));
    await updateRAG.mutateAsync(body);
    setRAGOverrides({});
    setRAGSaved(true);
    setTimeout(() => setRAGSaved(false), 2000);
  }

  async function handlePull() {
    if (!pullName.trim()) return;
    await pullModel.mutateAsync(pullName.trim());
    setPullName("");
  }

  async function handleWhisperSave() {
    const body = Object.entries(whisperOverrides).map(([key, value]) => ({ key, value }));
    await updateWhisper.mutateAsync(body);
    setWhisperOverrides({});
    setWhisperSaved(true);
    setTimeout(() => setWhisperSaved(false), 2000);
  }

  const hasChanges = Object.keys(overrides).length > 0;
  const hasRAGChanges = Object.keys(ragOverrides).length > 0;
  const hasWhisperChanges = Object.keys(whisperOverrides).length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Gestion IA</h1>
        <p className="text-sm text-muted-foreground">
          Configurez les modèles Ollama et les paramètres de recherche
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left panel */}
        <div className="space-y-6">
          {/* Model assignments */}
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

          {/* RAG Settings */}
          {ragData && (
            <div className="bg-background rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  <h2 className="text-lg font-semibold">Recherche intelligente (RAG)</h2>
                </div>
                <Button size="sm" onClick={handleRAGSave} disabled={!hasRAGChanges && !ragSaved || updateRAG.isPending}>
                  {ragSaved ? (
                    <><Check className="w-4 h-4 mr-1" /> Sauvegardé</>
                  ) : updateRAG.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sauvegarde…</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1" /> Sauvegarder</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                ChromaDB : <span className="font-mono font-medium text-foreground">{ragData.chroma_url}</span>
              </p>

              <div className="space-y-4">
                {ragData.settings.map((s) => (
                  <div key={s.key} className="flex items-center gap-4">
                    <div className="w-60 shrink-0">
                      <Label className="text-sm font-medium">{s.label}</Label>
                      <p className="text-xs text-muted-foreground">défaut : {s.default}</p>
                    </div>
                    <Input
                      className="flex-1 font-mono text-sm"
                      value={ragOverrides[s.key] ?? s.value}
                      onChange={(e) => {
                        setRAGOverrides({ ...ragOverrides, [s.key]: e.target.value });
                        setRAGSaved(false);
                      }}
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                Les modifications sont appliquées immédiatement. Une réindexation est nécessaire après changement de la taille des chunks.
              </p>
            </div>
          )}
          {/* Whisper Settings */}
          {whisperData && (
            <div className="bg-background rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  <h2 className="text-lg font-semibold">Transcription (Whisper)</h2>
                </div>
                <Button size="sm" onClick={handleWhisperSave} disabled={!hasWhisperChanges && !whisperSaved || updateWhisper.isPending}>
                  {whisperSaved ? (
                    <><Check className="w-4 h-4 mr-1" /> Sauvegardé</>
                  ) : updateWhisper.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sauvegarde…</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1" /> Sauvegarder</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                Device : <span className="font-mono font-medium text-foreground">{whisperData.device}</span>
              </p>

              <div className="space-y-4">
                {whisperData.settings.map((s) => (
                  <div key={s.key} className="flex items-center gap-4">
                    <div className="w-60 shrink-0">
                      <Label className="text-sm font-medium">{s.label}</Label>
                      <p className="text-xs text-muted-foreground">défaut : {s.default || "(vide)"}</p>
                    </div>
                    {s.key === "whisper_condition_on_previous_text" ? (
                      <Select
                        value={whisperOverrides[s.key] ?? s.value}
                        onValueChange={(v) => {
                          setWhisperOverrides({ ...whisperOverrides, [s.key]: v });
                          setWhisperSaved(false);
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Oui</SelectItem>
                          <SelectItem value="false">Non (anti-hallucination)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : s.key === "whisper_model" ? (
                      <Select
                        value={whisperOverrides[s.key] ?? s.value}
                        onValueChange={(v) => {
                          setWhisperOverrides({ ...whisperOverrides, [s.key]: v });
                          setWhisperSaved(false);
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tiny">tiny (rapide, moins précis)</SelectItem>
                          <SelectItem value="base">base</SelectItem>
                          <SelectItem value="small">small</SelectItem>
                          <SelectItem value="medium">medium (recommandé)</SelectItem>
                          <SelectItem value="large-v3">large-v3 (meilleur, plus lent)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : s.key === "compute_type" ? (
                      <Select
                        value={whisperOverrides[s.key] ?? s.value}
                        onValueChange={(v) => {
                          setWhisperOverrides({ ...whisperOverrides, [s.key]: v });
                          setWhisperSaved(false);
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="float16">float16 (GPU, recommandé)</SelectItem>
                          <SelectItem value="float32">float32 (CPU)</SelectItem>
                          <SelectItem value="int8">int8 (économe en mémoire)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="flex-1 font-mono text-sm"
                        value={whisperOverrides[s.key] ?? s.value}
                        onChange={(e) => {
                          setWhisperOverrides({ ...whisperOverrides, [s.key]: e.target.value });
                          setWhisperSaved(false);
                        }}
                        placeholder={s.default || "(vide)"}
                      />
                    )}
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                Le modèle Whisper sera rechargé automatiquement lors de la prochaine transcription après modification.
                Le <strong>prompt initial</strong> permet d'injecter du vocabulaire métier (noms propres, termes techniques).
              </p>
            </div>
          )}
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
