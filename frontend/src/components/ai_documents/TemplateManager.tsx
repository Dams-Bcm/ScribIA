import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useOllamaModels,
} from "@/api/hooks/useAIDocuments";
import type { AIDocumentTemplate, AIDocumentTemplateCreate, AIDocumentType } from "@/api/types";

const DOC_TYPE_LABELS: Record<AIDocumentType, string> = {
  pv: "Procès-verbal",
  deliberation: "Délibération",
  summary: "Résumé exécutif",
  agenda: "Ordre du jour",
  custom: "Personnalisé",
};

const PLACEHOLDER_HELP = [
  "{organisation}", "{date}", "{titre}",
  "{points}", "{transcription}", "{documents}", "{duree}",
];

const EMPTY_FORM: AIDocumentTemplateCreate = {
  name: "",
  description: "",
  document_type: "custom",
  system_prompt: "",
  user_prompt_template: "",
  ollama_model: null,
  temperature: 0.3,
  is_active: true,
};

export function TemplateManager() {
  const { data: templates = [], isLoading } = useTemplates();
  const { data: ollamaData } = useOllamaModels();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AIDocumentTemplateCreate>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const userPromptRef = useRef<HTMLTextAreaElement>(null);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(tpl: AIDocumentTemplate) {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      description: tpl.description ?? "",
      document_type: tpl.document_type,
      system_prompt: tpl.system_prompt,
      user_prompt_template: tpl.user_prompt_template,
      ollama_model: tpl.ollama_model ?? null,
      temperature: tpl.temperature,
      is_active: tpl.is_active,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.system_prompt || !form.user_prompt_template) return;
    const payload = { ...form, description: form.description || null };
    if (editingId) {
      await updateTemplate.mutateAsync({ id: editingId, ...payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    setDialogOpen(false);
  }

  function set(field: keyof AIDocumentTemplateCreate, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function insertPlaceholder(ph: string) {
    const ta = userPromptRef.current;
    const current = form.user_prompt_template ?? "";
    if (!ta) {
      set("user_prompt_template", current + ph);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const updated = current.slice(0, start) + ph + current.slice(end);
    set("user_prompt_template", updated);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.selectionStart = start + ph.length;
      ta.selectionEnd = start + ph.length;
      ta.focus();
    });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nouveau template
        </Button>
      </div>

      <div className="space-y-2">
        {templates.map((tpl) => (
          <div key={tpl.id} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                className="flex-1 flex items-center gap-3 text-left"
                onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
              >
                <span className="font-medium text-sm">{tpl.name}</span>
                <Badge variant="outline" className="text-xs">
                  {DOC_TYPE_LABELS[tpl.document_type as AIDocumentType] ?? tpl.document_type}
                </Badge>
                {!tpl.is_active && (
                  <Badge variant="secondary" className="text-xs">Inactif</Badge>
                )}
                {expandedId === tpl.id ? (
                  <ChevronUp className="w-4 h-4 ml-auto text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
                )}
              </button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(tpl)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => deleteTemplate.mutate(tpl.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {expandedId === tpl.id && (
              <div className="px-4 pb-4 pt-1 bg-muted/30 border-t border-border space-y-3">
                {tpl.description && (
                  <p className="text-xs text-muted-foreground">{tpl.description}</p>
                )}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Prompt système</p>
                  <pre className="text-xs bg-background border border-border rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {tpl.system_prompt}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Prompt utilisateur</p>
                  <pre className="text-xs bg-background border border-border rounded p-2 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {tpl.user_prompt_template}
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground">
                  Modèle : <span className="font-mono">{tpl.ollama_model ?? "(défaut config)"}</span>
                  {" · "}Température : {tpl.temperature}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dialog création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le template" : "Nouveau template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nom *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Ex : Compte-rendu de réunion"
                />
              </div>
              <div className="space-y-1">
                <Label>Type de document</Label>
                <Select
                  value={form.document_type}
                  onValueChange={(v) => set("document_type", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Description optionnelle"
              />
            </div>

            <div className="space-y-1">
              <Label>Prompt système * <span className="text-xs text-muted-foreground">(instructions globales du LLM)</span></Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                value={form.system_prompt}
                onChange={(e) => set("system_prompt", e.target.value)}
                placeholder="Tu es un rédacteur spécialisé en…"
              />
            </div>

            <div className="space-y-1">
              <Label>Prompt utilisateur *</Label>
              <div className="flex flex-wrap gap-1 mb-1">
                {PLACEHOLDER_HELP.map((ph) => (
                  <button
                    key={ph}
                    type="button"
                    className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => insertPlaceholder(ph)}
                  >
                    {ph}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground self-center ml-1">
                  — cliquer pour insérer au curseur · ajoutez vos propres{" "}
                  <code className="font-mono">{"{variables}"}</code>
                </span>
              </div>
              <textarea
                ref={userPromptRef}
                className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
                value={form.user_prompt_template}
                onChange={(e) => set("user_prompt_template", e.target.value)}
                placeholder="Rédige un document pour {organisation} le {date}.\n\nORDRE DU JOUR :\n{points}\n\nTRANSCRIPTION :\n{transcription}"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Modèle Ollama <span className="text-xs text-muted-foreground">(laisser vide = défaut)</span></Label>
                <Select
                  value={form.ollama_model ?? "__default__"}
                  onValueChange={(v) => set("ollama_model", v === "__default__" ? null : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      (défaut : {ollamaData?.default ?? "config"})
                    </SelectItem>
                    {ollamaData?.models.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Température ({form.temperature})</Label>
                <input
                  type="range"
                  min="0" max="1" step="0.05"
                  value={form.temperature}
                  onChange={(e) => set("temperature", parseFloat(e.target.value))}
                  className="w-full mt-2"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || !form.system_prompt || !form.user_prompt_template}
            >
              {editingId ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
