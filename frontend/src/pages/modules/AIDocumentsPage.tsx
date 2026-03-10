import { useRef, useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  Building2,
  Check,
  Globe,
  Wand2,
  X,
} from "lucide-react";
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
  useGlobalTemplates,
  useCreateGlobalTemplate,
  useUpdateGlobalTemplate,
  useDeleteGlobalTemplate,
  useAssignGlobalTemplate,
  useGenerateGlobalWorkflow,
  useOllamaModels,
  downloadTemplatesExport,
  useImportTemplates,
} from "@/api/hooks/useAIDocuments";
import { useTenants } from "@/api/hooks/useTenants";
import type {
  AIDocumentTemplate,
  AIDocumentTemplateCreate,
  AIDocumentType,
  TemplateCategory,
  Tenant,
  WorkflowStep,
} from "@/api/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<AIDocumentType, string> = {
  pv: "Procès-verbal",
  deliberation: "Délibération",
  summary: "Résumé exécutif",
  agenda: "Ordre du jour",
  custom: "Personnalisé",
};

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  document: "Documents",
  procedure: "Procédures",
  email: "Emails",
};

const CATEGORY_TABS: { key: TemplateCategory; label: string }[] = [
  { key: "document", label: "Documents" },
  { key: "procedure", label: "Procédures" },
  { key: "email", label: "Emails" },
];

const PLACEHOLDER_HELP = [
  "{tenant}", "{date}", "{titre}",
  "{points}", "{transcription}", "{documents}", "{duree}",
  "{participants}", "{lieu}", "{description}", "{tenant_name}",
];

const EMPTY_FORM: AIDocumentTemplateCreate = {
  name: "",
  description: "",
  document_type: "custom",
  category: "document",
  system_prompt: "",
  user_prompt_template: "",
  map_system_prompt: null,
  ollama_model: null,
  temperature: 0.3,
  is_active: true,
};

// ── Main page ──────────────────────────────────────────────────────────────────

export function AIDocumentsPage() {
  const { data: templates = [], isLoading } = useGlobalTemplates();
  const { data: tenants = [] } = useTenants();
  const { data: ollamaData } = useOllamaModels();

  const createTemplate = useCreateGlobalTemplate();
  const updateTemplate = useUpdateGlobalTemplate();
  const deleteTemplate = useDeleteGlobalTemplate();
  const assignTemplate = useAssignGlobalTemplate();
  const importTemplates = useImportTemplates();
  const generateWorkflow = useGenerateGlobalWorkflow();
  const importRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<TemplateCategory>("document");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AIDocumentTemplateCreate>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assignDialogTpl, setAssignDialogTpl] = useState<AIDocumentTemplate | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);
  const userPromptRef = useRef<HTMLTextAreaElement>(null);

  // Filter templates by category
  const filtered = useMemo(
    () => templates.filter((t) => (t.category ?? "document") === category),
    [templates, category],
  );

  // Category counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { document: 0, procedure: 0, email: 0 };
    for (const t of templates) c[t.category ?? "document"] = (c[t.category ?? "document"] ?? 0) + 1;
    return c;
  }, [templates]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category });
    setDialogOpen(true);
  }

  function openEdit(tpl: AIDocumentTemplate) {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      description: tpl.description ?? "",
      document_type: tpl.document_type,
      category: tpl.category ?? "document",
      system_prompt: tpl.system_prompt,
      user_prompt_template: tpl.user_prompt_template,
      map_system_prompt: tpl.map_system_prompt ?? null,
      ollama_model: tpl.ollama_model ?? null,
      temperature: tpl.temperature,
      is_active: tpl.is_active,
      workflow_steps: tpl.workflow_steps ?? null,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.system_prompt || !form.user_prompt_template) return;
    const payload = { ...form, description: form.description || null };
    if (editingId) {
      await updateTemplate.mutateAsync({ id: editingId, ...payload });
      setDialogOpen(false);
    } else {
      const created = await createTemplate.mutateAsync(payload);
      if (created.category === "procedure") {
        // Auto-generate workflow and re-open in edit mode
        setEditingId(created.id);
        try {
          const result = await generateWorkflow.mutateAsync(created.id);
          setForm((f) => ({ ...f, workflow_steps: result.workflow_steps }));
        } catch {
          // Generation failed — still open in edit mode so user can retry
        }
      } else {
        setDialogOpen(false);
      }
    }
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
    requestAnimationFrame(() => {
      ta.selectionStart = start + ph.length;
      ta.selectionEnd = start + ph.length;
      ta.focus();
    });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importTemplates.mutateAsync(file);
      setImportResult(result);
    } catch {
      setImportResult({ created: 0, errors: ["Erreur lors de l'import"] });
    }
    e.target.value = "";
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Chargement…</div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Templates IA</h1>
      <p className="text-muted-foreground mb-6">
        Gérez les templates globaux et provisionnez-les sur vos tenants
      </p>

      {/* Category tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex bg-background border border-border rounded-lg overflow-hidden">
          {CATEGORY_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                category === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              } ${key !== "document" ? "border-l border-border" : ""}`}
            >
              {label}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  category === key ? "bg-primary/20" : "bg-muted"
                }`}
              >
                {counts[key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadTemplatesExport()}>
            <Download className="w-4 h-4 mr-1" /> Exporter
          </Button>
          <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> Importer
          </Button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Nouveau template
          </Button>
        </div>
      </div>

      {importResult && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            importResult.errors.length
              ? "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800"
              : "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
          }`}
        >
          <p>
            {importResult.created} template{importResult.created !== 1 ? "s" : ""} importé
            {importResult.created !== 1 ? "s" : ""}
          </p>
          {importResult.errors.map((err, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{err}</p>
          ))}
          <button className="text-xs underline mt-1" onClick={() => setImportResult(null)}>
            Fermer
          </button>
        </div>
      )}

      {/* Template list */}
      <div className="bg-background rounded-xl border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-4">
              Aucun template global dans cette catégorie
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Créer un template
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((tpl) => (
              <TemplateRow
                key={tpl.id}
                tpl={tpl}
                expanded={expandedId === tpl.id}
                onToggle={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                onEdit={() => openEdit(tpl)}
                onDelete={() => deleteTemplate.mutate(tpl.id)}
                onAssign={() => setAssignDialogTpl(tpl)}
                tenantCount={tpl.assigned_tenant_ids?.length ?? 0}
                totalTenants={tenants.length}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit dialog */}
      <TemplateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        form={form}
        set={set}
        ollamaData={ollamaData}
        userPromptRef={userPromptRef}
        insertPlaceholder={insertPlaceholder}
        onSave={handleSave}
        isSaving={createTemplate.isPending || updateTemplate.isPending || generateWorkflow.isPending}
        onGenerateWorkflow={editingId ? async () => {
          const result = await generateWorkflow.mutateAsync(editingId);
          set("workflow_steps", result.workflow_steps);
        } : undefined}
        isGeneratingWorkflow={generateWorkflow.isPending}
      />

      {/* Assign dialog */}
      {assignDialogTpl && (
        <AssignDialog
          template={assignDialogTpl}
          tenants={tenants}
          onClose={() => setAssignDialogTpl(null)}
          onSave={async (tenantIds) => {
            await assignTemplate.mutateAsync({
              templateId: assignDialogTpl.id,
              tenantIds,
            });
            setAssignDialogTpl(null);
          }}
          isSaving={assignTemplate.isPending}
        />
      )}
    </div>
  );
}

// ── Template row ─────────────────────────────────────────────────────────────

function TemplateRow({
  tpl,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAssign,
  tenantCount,
  totalTenants,
}: {
  tpl: AIDocumentTemplate;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  tenantCount: number;
  totalTenants: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="flex-1 flex items-center gap-3 text-left min-w-0" onClick={onToggle}>
          <span className="font-medium text-sm truncate">{tpl.name}</span>
          <Badge variant="outline" className="text-xs flex-shrink-0">
            {DOC_TYPE_LABELS[tpl.document_type as AIDocumentType] ?? tpl.document_type}
          </Badge>
          {!tpl.is_active && <Badge variant="secondary" className="text-xs">Inactif</Badge>}
          {expanded ? (
            <ChevronUp className="w-4 h-4 ml-auto text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground flex-shrink-0" />
          )}
        </button>

        {/* Provisioning indicator */}
        <button
          onClick={onAssign}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-muted/50 transition-colors"
          title="Provisionner sur des tenants"
        >
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className={tenantCount > 0 ? "text-primary font-medium" : "text-muted-foreground"}>
            {tenantCount}/{totalTenants}
          </span>
        </button>

        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={onDelete}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {expanded && (
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
          {tpl.map_system_prompt && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Prompt map (résumé par chunk)</p>
              <pre className="text-xs bg-background border border-border rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {tpl.map_system_prompt}
              </pre>
            </div>
          )}
          {tpl.workflow_steps && tpl.workflow_steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Workflow ({tpl.workflow_steps.length} étapes)
              </p>
              <div className="flex flex-wrap gap-1">
                {tpl.workflow_steps.map((s, i) => (
                  <span key={i} className="text-[11px] bg-background border border-border rounded px-2 py-0.5">
                    {i + 1}. {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Modèle : <span className="font-mono">{tpl.ollama_model ?? "(défaut config)"}</span>
            {" · "}Température : {tpl.temperature}
            {" · "}Catégorie : {CATEGORY_LABELS[tpl.category as TemplateCategory] ?? tpl.category}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Workflow steps editor ────────────────────────────────────────────────────

const STEP_TYPE_LABELS: Record<string, string> = {
  form: "Formulaire",
  select_contacts: "Sélection contacts",
  send_email: "Envoi email",
  collect_responses: "Collecte réponses",
  generate_document: "Génération document",
  upload_document: "Upload fichier",
  manual: "Étape manuelle",
};

function WorkflowStepsEditor({
  steps,
  onChange,
  onGenerate,
  isGenerating,
  canGenerate,
}: {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  canGenerate: boolean;
}) {
  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function moveStep(index: number, dir: -1 | 1) {
    const newSteps = [...steps];
    const target = index + dir;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target]!, newSteps[index]!];
    onChange(newSteps);
  }

  function addStep() {
    onChange([...steps, { step_type: "manual", label: "Nouvelle étape", is_required: true }]);
  }

  function updateStep(index: number, field: keyof WorkflowStep, value: unknown) {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index]!, [field]: value } as WorkflowStep;
    onChange(newSteps);
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">
          Workflow ({steps.length} étape{steps.length !== 1 ? "s" : ""})
        </Label>
        <div className="flex gap-2">
          {canGenerate && onGenerate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={isGenerating}
            >
              <Wand2 className="w-3.5 h-3.5 mr-1" />
              {isGenerating ? "Génération…" : "Générer via IA"}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter
          </Button>
        </div>
      </div>

      {!canGenerate && steps.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Le workflow sera généré automatiquement à la création du template.
        </p>
      )}

      {steps.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-border p-2 bg-background"
            >
              <div className="flex flex-col gap-0.5 pt-1">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => moveStep(i, -1)}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === steps.length - 1}
                  onClick={() => moveStep(i, 1)}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    value={step.label}
                    onChange={(e) => updateStep(i, "label", e.target.value)}
                    className="h-7 text-xs flex-1"
                    placeholder="Nom de l'étape"
                  />
                  <Select
                    value={step.step_type}
                    onValueChange={(v) => updateStep(i, "step_type", v)}
                  >
                    <SelectTrigger className="h-7 text-xs w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STEP_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {step.description && (
                  <p className="text-[11px] text-muted-foreground pl-1">{step.description}</p>
                )}
              </div>

              <button
                type="button"
                className="text-muted-foreground hover:text-destructive mt-1"
                onClick={() => removeStep(i)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Template form dialog ────────────────────────────────────────────────────

function TemplateFormDialog({
  open,
  onOpenChange,
  editingId,
  form,
  set,
  ollamaData,
  userPromptRef,
  insertPlaceholder,
  onSave,
  isSaving,
  onGenerateWorkflow,
  isGeneratingWorkflow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: AIDocumentTemplateCreate;
  set: (field: keyof AIDocumentTemplateCreate, value: unknown) => void;
  ollamaData: { models: string[]; default: string } | undefined;
  userPromptRef: React.RefObject<HTMLTextAreaElement | null>;
  insertPlaceholder: (ph: string) => void;
  onSave: () => void;
  isSaving: boolean;
  onGenerateWorkflow?: () => void;
  isGeneratingWorkflow?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "Modifier le template" : "Nouveau template global"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Nom *</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ex : Compte-rendu de réunion"
              />
            </div>
            <div className="space-y-1">
              <Label>Catégorie</Label>
              <Select
                value={form.category ?? "document"}
                onValueChange={(v) => set("category", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_TABS.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Label>
              Prompt système *{" "}
              <span className="text-xs text-muted-foreground">(instructions globales du LLM)</span>
            </Label>
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
                — cliquer pour insérer au curseur
              </span>
            </div>
            <textarea
              ref={userPromptRef}
              className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
              value={form.user_prompt_template}
              onChange={(e) => set("user_prompt_template", e.target.value)}
              placeholder="Rédige un document pour {tenant} le {date}..."
            />
          </div>

          <div className="space-y-1">
            <Label>
              Prompt map{" "}
              <span className="text-xs text-muted-foreground">
                (optionnel · résumé par chunk en map-reduce)
              </span>
            </Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              value={form.map_system_prompt ?? ""}
              onChange={(e) => set("map_system_prompt", e.target.value || null)}
              placeholder="Laisser vide pour le prompt map par défaut."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>
                Modèle Ollama{" "}
                <span className="text-xs text-muted-foreground">(vide = défaut)</span>
              </Label>
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
                min="0"
                max="1"
                step="0.05"
                value={form.temperature}
                onChange={(e) => set("temperature", parseFloat(e.target.value))}
                className="w-full mt-2"
              />
            </div>
          </div>
        </div>

        {/* Workflow steps section (procedure templates only) */}
        {form.category === "procedure" && (
          <WorkflowStepsEditor
            steps={form.workflow_steps ?? []}
            onChange={(steps) => set("workflow_steps", steps)}
            onGenerate={onGenerateWorkflow}
            isGenerating={isGeneratingWorkflow}
            canGenerate={!!editingId}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={onSave}
            disabled={!form.name || !form.system_prompt || !form.user_prompt_template || isSaving}
          >
            {isSaving && isGeneratingWorkflow
              ? "Génération du workflow…"
              : editingId
                ? "Enregistrer"
                : form.category === "procedure"
                  ? "Créer & générer workflow"
                  : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign dialog ────────────────────────────────────────────────────────────

function AssignDialog({
  template,
  tenants,
  onClose,
  onSave,
  isSaving,
}: {
  template: AIDocumentTemplate;
  tenants: Tenant[];
  onClose: () => void;
  onSave: (tenantIds: string[]) => Promise<void>;
  isSaving: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(template.assigned_tenant_ids ?? []),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(tenants.map((t) => t.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Provisionner « {template.name} »</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-3">
          Sélectionnez les tenants qui auront accès à ce template.
        </p>

        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={selectAll}>
            Tout sélectionner
          </Button>
          <Button size="sm" variant="outline" onClick={selectNone}>
            Tout désélectionner
          </Button>
        </div>

        <div className="space-y-1 max-h-60 overflow-y-auto border border-border rounded-lg p-2">
          {tenants.map((tenant) => (
            <label
              key={tenant.id}
              onClick={() => toggle(tenant.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                selected.has(tenant.id)
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-muted/50"
              }`}
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  selected.has(tenant.id)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {selected.has(tenant.id) && <Check className="w-3 h-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tenant.name}</p>
                {tenant.sector && (
                  <p className="text-xs text-muted-foreground">{tenant.sector}</p>
                )}
              </div>
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {selected.size} / {tenants.length} tenants sélectionnés
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => onSave([...selected])}
            disabled={isSaving}
          >
            <Building2 className="w-4 h-4 mr-1" />
            Provisionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
