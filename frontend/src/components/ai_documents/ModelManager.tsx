import { useState } from "react";
import { Download, Trash2, HardDrive, Loader2, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOllamaModels } from "@/api/hooks/useAIDocuments";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

// Quelques modèles courants suggérés
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

export function ModelManager() {
  const [open, setOpen] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [pullTarget, setPullTarget] = useState("");
  const [pullState, setPullState] = useState<PullState>({ status: "idle", message: "" });
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: ollamaData, refetch } = useOllamaModels();
  const qc = useQueryClient();

  function startPull(modelName: string) {
    if (pullState.status === "pulling") return;
    const name = modelName.trim();
    if (!name) return;
    setPullTarget(name);
    setPullState({ status: "pulling", message: "Connexion à Ollama…" });

    const token = localStorage.getItem("token") ?? "";
    const es = new EventSource(
      `/api/ai-documents/ollama-models/pull?model=${encodeURIComponent(name)}`
    );

    // EventSource ne supporte pas les headers → on utilise fetch + ReadableStream
    es.close();

    fetch(`/api/ai-documents/ollama-models/pull?model=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}` },
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
              qc.invalidateQueries({ queryKey: ["ai-documents", "ollama-models"] });
              refetch();
              return;
            }
            const msg = chunk.status ?? "Téléchargement…";
            const total = chunk.total;
            const completed = chunk.completed;
            setPullState({ status: "pulling", message: msg, total, completed });
          } catch {
            // ligne non JSON, ignorer
          }
        }
      }
      setPullState({ status: "done", message: "Terminé" });
      qc.invalidateQueries({ queryKey: ["ai-documents", "ollama-models"] });
      refetch();
    }).catch((err) => {
      setPullState({ status: "error", message: String(err) });
    });
  }

  function handleDelete(modelName: string) {
    api.delete(`/ai-documents/ollama-models/${encodeURIComponent(modelName)}`).then(() => {
      qc.invalidateQueries({ queryKey: ["ai-documents", "ollama-models"] });
      refetch();
    });
  }

  const progress =
    pullState.total && pullState.completed
      ? Math.round((pullState.completed / pullState.total) * 100)
      : null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <HardDrive className="w-4 h-4 mr-1" />
        Gérer les modèles
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modèles Ollama</DialogTitle>
          </DialogHeader>

          {/* Modèles installés */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Installés ({ollamaData?.models.length ?? 0})
            </p>
            {ollamaData?.models.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun modèle installé</p>
            ) : (
              <div className="space-y-1">
                {ollamaData?.models.map((m) => (
                  <div key={m} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30">
                    <span className="flex-1 text-sm font-mono">{m}</span>
                    {m === ollamaData.default && (
                      <Badge variant="outline" className="text-xs">défaut</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(m)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Télécharger un modèle */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Télécharger un modèle
            </p>

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
                <div className="space-y-1">
                  {SUGGESTED_MODELS.map((s) => {
                    const installed = ollamaData?.models.includes(s.name) ?? false;
                    return (
                      <button
                        key={s.name}
                        className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left ${
                          installed
                            ? "opacity-50 cursor-default"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => !installed && setCustomModel(s.name)}
                        disabled={installed}
                      >
                        {installed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                        ) : (
                          <Download className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
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

            {/* Champ manuel */}
            <div className="flex gap-2">
              <Input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="ex: llama3.1:8b"
                className="font-mono text-sm"
                onKeyDown={(e) => e.key === "Enter" && startPull(customModel)}
              />
              <Button
                onClick={() => startPull(customModel)}
                disabled={!customModel.trim() || pullState.status === "pulling"}
              >
                {pullState.status === "pulling" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Progression */}
            {pullState.status !== "idle" && (
              <div className="mt-3 rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {pullState.status === "pulling" && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
                  )}
                  {pullState.status === "done" && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  )}
                  {pullState.status === "error" && (
                    <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    <span className="font-mono font-medium text-foreground">{pullTarget}</span>
                    {" — "}
                    {pullState.message}
                  </span>
                </div>

                {progress !== null && pullState.status === "pulling" && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {(pullState.status === "done" || pullState.status === "error") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setPullState({ status: "idle", message: "" })}
                  >
                    Fermer
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
