import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Save, Download, Trash2, Loader2, Check, AlertCircle, Search, Mic, Users, ChevronDown, CheckCircle2, XCircle } from "lucide-react";

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

interface PyannoteSetting {
  key: string;
  label: string;
  value: string;
  default: string;
}

interface PyannoteSettingsResponse {
  settings: PyannoteSetting[];
  pipeline_model: string;
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

function usePyannoteSettings() {
  return useQuery({
    queryKey: ["pyannote-settings"],
    queryFn: () => api.get<PyannoteSettingsResponse>("/admin/pyannote-settings"),
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

function useUpdatePyannoteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; value: string }[]) =>
      api.put("/admin/pyannote-settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pyannote-settings"] }),
  });
}

const SUGGESTED_MODELS = [
  { name: "llama3.1:8b",   desc: "Llama 3.1 8B — polyvalent, rapide (~5 Go)" },
  { name: "llama3.1:70b",  desc: "Llama 3.1 70B — haute qualité (~40 Go)" },
  { name: "mistral:7b",    desc: "Mistral 7B — bon en français (~4 Go)" },
  { name: "mistral-nemo",  desc: "Mistral Nemo 12B — excellent en français (~7 Go)" },
  { name: "gemma2:9b",     desc: "Gemma 2 9B — Google, efficace (~6 Go)" },
  { name: "qwen2.5:7b",    desc: "Qwen 2.5 7B — multilingue (~5 Go)" },
];

type PullStatus = "idle" | "pulling" | "done" | "error";

interface PullState {
  status: PullStatus;
  message: string;
  total?: number;
  completed?: number;
}

function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.delete(`/ai-documents/ollama-models/${encodeURIComponent(name)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-settings"] }),
  });
}

export function AISettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useAISettings();
  const { data: ragData } = useRAGSettings();
  const { data: whisperData } = useWhisperSettings();
  const { data: pyannoteData } = usePyannoteSettings();
  const updateSettings = useUpdateAISettings();
  const updateRAG = useUpdateRAGSettings();
  const updateWhisper = useUpdateWhisperSettings();
  const updatePyannote = useUpdatePyannoteSettings();
  const deleteModel = useDeleteModel();

  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [ragOverrides, setRAGOverrides] = useState<Record<string, string>>({});
  const [whisperOverrides, setWhisperOverrides] = useState<Record<string, string>>({});
  const [pyannoteOverrides, setPyannoteOverrides] = useState<Record<string, string>>({});
  const [pullName, setPullName] = useState("");
  const [pullState, setPullState] = useState<PullState>({ status: "idle", message: "" });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ragSaved, setRAGSaved] = useState(false);
  const [whisperSaved, setWhisperSaved] = useState(false);
  const [pyannoteSaved, setPyannoteSaved] = useState(false);

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

  function handlePull(modelName?: string) {
    const name = (modelName ?? pullName).trim();
    if (!name || pullState.status === "pulling") return;
    setPullState({ status: "pulling", message: "Connexion à Ollama…" });

    fetch(`/api/ai-documents/ollama-models/pull?model=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }).then(async (resp) => {
      if (!resp.body) throw new Error("Pas de body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const chunk = JSON.parse(raw);
            if (chunk.error) {
              setPullState({ status: "error", message: chunk.error });
              return;
            }
            if (chunk.status === "success") {
              setPullState({ status: "done", message: "Modèle installé avec succès !" });
              qc.invalidateQueries({ queryKey: ["ai-settings"] });
              setPullName("");
              return;
            }
            setPullState({ status: "pulling", message: chunk.status ?? "Téléchargement…", total: chunk.total, completed: chunk.completed });
          } catch { /* skip */ }
        }
      }
      setPullState({ status: "done", message: "Terminé" });
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
      setPullName("");
    }).catch((err) => {
      setPullState({ status: "error", message: String(err) });
    });
  }

  async function handleWhisperSave() {
    const body = Object.entries(whisperOverrides).map(([key, value]) => ({ key, value }));
    await updateWhisper.mutateAsync(body);
    setWhisperOverrides({});
    setWhisperSaved(true);
    setTimeout(() => setWhisperSaved(false), 2000);
  }

  async function handlePyannoteSave() {
    const body = Object.entries(pyannoteOverrides).map(([key, value]) => ({ key, value }));
    await updatePyannote.mutateAsync(body);
    setPyannoteOverrides({});
    setPyannoteSaved(true);
    setTimeout(() => setPyannoteSaved(false), 2000);
  }

  const hasChanges = Object.keys(overrides).length > 0;
  const hasRAGChanges = Object.keys(ragOverrides).length > 0;
  const hasWhisperChanges = Object.keys(whisperOverrides).length > 0;
  const hasPyannoteChanges = Object.keys(pyannoteOverrides).length > 0;

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
                {ragData.settings.map((s) => {
                  const ragDescs: Record<string, string> = {
                    rag_chunk_size: "Taille des morceaux de texte indexés. Plus grand = plus de contexte, moins précis",
                    rag_chunk_overlap: "Chevauchement entre chunks pour éviter de couper des phrases importantes",
                    rag_top_k: "Nombre de résultats retournés par recherche. Plus élevé = plus de contexte pour le LLM",
                    embedding_model: "Modèle Ollama utilisé pour calculer les vecteurs de recherche sémantique",
                  };
                  return (
                  <div key={s.key}>
                  <div className="flex items-center gap-4">
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
                  {ragDescs[s.key] && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{ragDescs[s.key]}</p>
                  )}
                  </div>
                  );
                })}
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
                {whisperData.settings.map((s) => {
                  const whisperDescs: Record<string, string> = {
                    whisper_model: "Plus le modèle est gros, plus la transcription est précise mais lente",
                    whisper_language: "Code ISO de la langue (fr, en, de…). Laisser vide pour détection automatique",
                    whisper_beam_size: "Nombre de hypothèses explorées. Plus élevé = plus précis mais plus lent",
                    whisper_no_speech_threshold: "Seuil en dessous duquel un segment est considéré comme du silence",
                    whisper_temperature: "Cascade de températures pour le décodage. 0 = déterministe",
                    whisper_initial_prompt: "Vocabulaire métier à injecter (noms propres, acronymes, termes techniques)",
                    whisper_condition_on_previous_text: "Désactiver réduit les hallucinations mais peut fragmenter les phrases",
                    whisper_vad_min_silence_ms: "Durée minimale de silence pour couper un segment (en millisecondes)",
                    whisper_vad_speech_pad_ms: "Marge ajoutée avant/après chaque segment de parole détecté",
                    compute_type: "Précision de calcul — float16 pour GPU, float32 pour CPU, int8 pour économiser la mémoire",
                  };
                  return (
                  <div key={s.key}>
                  <div className="flex items-center gap-4">
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
                  {whisperDescs[s.key] && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{whisperDescs[s.key]}</p>
                  )}
                  </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                Le modèle Whisper sera rechargé automatiquement lors de la prochaine transcription après modification.
                Le <strong>prompt initial</strong> permet d'injecter du vocabulaire métier (noms propres, termes techniques).
              </p>
            </div>
          )}

          {/* Pyannote / Diarisation Settings */}
          {pyannoteData && (
            <div className="bg-background rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <h2 className="text-lg font-semibold">Diarisation (Pyannote)</h2>
                </div>
                <Button size="sm" onClick={handlePyannoteSave} disabled={!hasPyannoteChanges && !pyannoteSaved || updatePyannote.isPending}>
                  {pyannoteSaved ? (
                    <><Check className="w-4 h-4 mr-1" /> Sauvegardé</>
                  ) : updatePyannote.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sauvegarde…</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1" /> Sauvegarder</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                Pipeline : <span className="font-mono font-medium text-foreground">{pyannoteData.pipeline_model}</span>
              </p>

              <div className="space-y-4">
                {pyannoteData.settings.map((s) => {
                  const descriptions: Record<string, string> = {
                    min_speakers: "Nombre minimum de locuteurs que pyannote tentera de détecter",
                    max_speakers: "Nombre maximum de locuteurs — augmenter si vos réunions ont beaucoup de participants",
                    clustering_threshold: "Plus haut = plus de locuteurs distincts, plus bas = fusionne des voix similaires. Recommandé : 0.65–0.80",
                    speaker_matching_threshold: "Seuil de similarité cosine pour l'auto-identification des intervenants enrollés. Plus bas = plus permissif",
                  };
                  return (
                    <div key={s.key}>
                      <div className="flex items-center gap-4">
                        <div className="w-60 shrink-0">
                          <Label className="text-sm font-medium">{s.label}</Label>
                          <p className="text-xs text-muted-foreground">défaut : {s.default}</p>
                        </div>
                        <Input
                          className="flex-1 font-mono text-sm"
                          value={pyannoteOverrides[s.key] ?? s.value}
                          onChange={(e) => {
                            setPyannoteOverrides({ ...pyannoteOverrides, [s.key]: e.target.value });
                            setPyannoteSaved(false);
                          }}
                          placeholder={s.default}
                        />
                      </div>
                      {descriptions[s.key] && (
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 ml-0">{descriptions[s.key]}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                Le changement du seuil de clustering décharge le pipeline — il sera rechargé à la prochaine diarisation.
              </p>
            </div>
          )}
        </div>

        {/* Right panel: models management */}
        <div className="space-y-6">
          {/* Pull model */}
          <div className="bg-background rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Télécharger un modèle</h3>

            {/* Suggestions */}
            <div className="mb-3">
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
                onClick={() => setShowSuggestions((v) => !v)}
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showSuggestions ? "rotate-180" : ""}`} />
                Modèles suggérés
              </button>
              {showSuggestions && (
                <div className="space-y-1 mb-3">
                  {SUGGESTED_MODELS.map((s) => {
                    const installed = data.ollama_models.includes(s.name);
                    return (
                      <button
                        key={s.name}
                        className={`w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left ${
                          installed ? "opacity-50 cursor-default" : "hover:bg-muted/50"
                        }`}
                        onClick={() => !installed && setPullName(s.name)}
                        disabled={installed}
                      >
                        {installed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Download className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-mono font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                placeholder="ex: llama3.1:70b"
                className="text-sm font-mono"
                onKeyDown={(e) => e.key === "Enter" && handlePull()}
              />
              <Button size="sm" onClick={() => handlePull()} disabled={!pullName.trim() || pullState.status === "pulling"}>
                {pullState.status === "pulling" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Pull progress */}
            {pullState.status !== "idle" && (
              <div className="mt-3 rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {pullState.status === "pulling" && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
                  {pullState.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  {pullState.status === "error" && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  <span className="text-xs text-muted-foreground truncate">{pullState.message}</span>
                </div>
                {pullState.total && pullState.completed && pullState.status === "pulling" && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.round((pullState.completed / pullState.total) * 100)}%` }}
                    />
                  </div>
                )}
                {(pullState.status === "done" || pullState.status === "error") && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setPullState({ status: "idle", message: "" })}
                  >
                    Fermer
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Installed models */}
          <div className="bg-background rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Modèles installés ({data.ollama_models.length})</h3>
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
