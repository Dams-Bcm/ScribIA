import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { SECTOR_PRESETS, type TenantSector } from "../../api/types";
import type { FormQuestion, ProcedureTemplateRole } from "../../api/types";
import { Settings2, Plus, Trash2, ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface SectorTemplate {
  id: string;
  name: string;
  description: string | null;
  sector: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  roles: ProcedureTemplateRole[];
}

const QUESTION_TYPES = [
  { value: "textarea", label: "Texte long" },
  { value: "text", label: "Texte court" },
];

function useSectorTemplates(sector: string) {
  return useQuery({
    queryKey: ["sector-templates", sector],
    queryFn: () => api.get<SectorTemplate[]>(`/admin/sectors/${sector}/templates`),
    enabled: !!sector,
  });
}

function useCreateSectorTemplate(sector: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<SectorTemplate>(`/admin/sectors/${sector}/templates`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sector-templates", sector] }),
  });
}

function useDeleteSectorTemplate(sector: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/sectors/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sector-templates", sector] }),
  });
}

interface GeneratedTemplate {
  name: string;
  description?: string | null;
  roles: { role_name: string; invitation_delay_days: number; form_questions: FormQuestion[] }[];
}

// ── Template manager for a sector ───────────────────────────────────────────

function SectorTemplateManager({ sector }: { sector: TenantSector }) {
  const { data: templates = [], isLoading } = useSectorTemplates(sector);
  const createTemplate = useCreateSectorTemplate(sector);
  const deleteTemplate = useDeleteSectorTemplate(sector);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // AI generation
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genDescription, setGenDescription] = useState("");
  const [genResults, setGenResults] = useState<GeneratedTemplate[] | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const generateMutation = useMutation({
    mutationFn: (description: string) =>
      api.post<{ templates: GeneratedTemplate[] }>("/admin/sectors/generate-workflow", { description, sector }),
  });

  async function handleGenerate() {
    if (!genDescription.trim()) return;
    setGenError(null);
    setGenResults(null);
    try {
      const result = await generateMutation.mutateAsync(genDescription);
      setGenResults(result.templates);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Erreur de génération");
    }
  }

  async function handleSaveGenerated() {
    if (!genResults) return;
    for (const tpl of genResults) {
      await createTemplate.mutateAsync({
        name: tpl.name,
        description: tpl.description || null,
        roles: tpl.roles,
      });
    }
    setGenerateOpen(false);
    setGenDescription("");
    setGenResults(null);
  }

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roles, setRoles] = useState<Omit<ProcedureTemplateRole, "id">[]>([]);

  function addRole() {
    setRoles([...roles, { role_name: "", order_index: roles.length, form_questions: [], invitation_delay_days: 15 }]);
  }

  function updateRole(idx: number, field: string, value: unknown) {
    setRoles(roles.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function removeRole(idx: number) {
    setRoles(roles.filter((_, i) => i !== idx));
  }

  function addQuestion(roleIdx: number) {
    const newQ: FormQuestion = { id: crypto.randomUUID(), label: "", type: "textarea", options: [], required: false };
    updateRole(roleIdx, "form_questions", [...(roles[roleIdx]?.form_questions ?? []), newQ]);
  }

  function updateQuestion(roleIdx: number, qIdx: number, field: string, value: unknown) {
    const qs = (roles[roleIdx]?.form_questions ?? []).map((q, i) => i === qIdx ? { ...q, [field]: value } : q);
    updateRole(roleIdx, "form_questions", qs);
  }

  function removeQuestion(roleIdx: number, qIdx: number) {
    updateRole(roleIdx, "form_questions", (roles[roleIdx]?.form_questions ?? []).filter((_, i) => i !== qIdx));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    await createTemplate.mutateAsync({ name: name.trim(), description: description.trim() || null, roles });
    setCreateOpen(false);
    setName(""); setDescription(""); setRoles([]);
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Templates de procédure
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="w-3.5 h-3.5 mr-1" /> Générer avec IA
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Nouveau template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Aucun template pour ce secteur. Les seeds par défaut seront utilisées lors du provisionnement.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="border border-border rounded-lg">
              <div className="flex items-center gap-3 px-4 py-3">
                <Settings2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tpl.roles.length} rôle(s)
                    {tpl.description && ` · ${tpl.description}`}
                  </p>
                </div>
                <Badge variant={tpl.is_active ? "outline" : "secondary"} className="text-xs">
                  {tpl.is_active ? "Actif" : "Inactif"}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}>
                  {expandedId === tpl.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteTemplate.mutate(tpl.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              {expandedId === tpl.id && (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  {tpl.roles.map((role) => (
                    <div key={role.id} className="bg-muted rounded p-3 space-y-1">
                      <p className="text-sm font-medium">{role.role_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Invitation J-{role.invitation_delay_days} · {role.form_questions.length} question(s)
                      </p>
                      {role.form_questions.map((q) => (
                        <p key={q.id} className="text-xs text-muted-foreground pl-2 border-l border-border">
                          {q.label}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau template de procédure</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nom *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : AG Copropriété" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)} rows={2} />
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Rôles participants</p>
                <Button size="sm" variant="outline" onClick={addRole}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter un rôle
                </Button>
              </div>
              {roles.map((role, ri) => (
                <div key={ri} className="border border-border rounded-lg p-3 space-y-3">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Nom du rôle</Label>
                      <Input value={role.role_name} onChange={(e) => updateRole(ri, "role_name", e.target.value)} placeholder="Ex : Copropriétaire" />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Invitation (J-)</Label>
                      <Input type="number" value={role.invitation_delay_days} onChange={(e) => updateRole(ri, "invitation_delay_days", parseInt(e.target.value) || 15)} min={1} />
                    </div>
                    <Button variant="ghost" size="icon" className="mt-5 text-muted-foreground hover:text-destructive" onClick={() => removeRole(ri)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Questions du formulaire</Label>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addQuestion(ri)}>
                        <Plus className="w-3 h-3 mr-1" /> Question
                      </Button>
                    </div>
                    {role.form_questions.map((q, qi) => (
                      <div key={q.id} className="flex gap-2 items-start bg-muted rounded p-2">
                        <Input className="flex-1 h-7 text-xs" value={q.label} onChange={(e) => updateQuestion(ri, qi, "label", e.target.value)} placeholder="Libellé de la question…" />
                        <Select value={q.type} onValueChange={(v) => updateQuestion(ri, qi, "type", v)}>
                          <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {QUESTION_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeQuestion(ri, qi)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || createTemplate.isPending}>
              {createTemplate.isPending ? "Création…" : "Créer le template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate with AI dialog */}
      <Dialog open={generateOpen} onOpenChange={(open) => { setGenerateOpen(open); if (!open) { setGenResults(null); setGenError(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Générer un workflow avec l'IA
            </DialogTitle>
          </DialogHeader>

          {!genResults ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Décrivez le workflow souhaité</Label>
                <Textarea
                  value={genDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setGenDescription(e.target.value)}
                  rows={12}
                  placeholder={"Décrivez les étapes du processus, les rôles impliqués, les délais, les documents à produire...\n\nExemple : Workflow d'AG de copropriété avec convocation J-21, collecte des questions des copropriétaires, vote par correspondance, tenue de l'AG, rédaction du PV..."}
                  className="font-mono text-xs"
                />
              </div>
              {genError && (
                <p className="text-sm text-destructive">{genError}</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerateOpen(false)}>Annuler</Button>
                <Button onClick={handleGenerate} disabled={!genDescription.trim() || generateMutation.isPending}>
                  {generateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Génération en cours…</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-1" /> Générer</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                L'IA a généré {genResults.length} template(s). Vérifiez et ajustez si nécessaire avant de sauvegarder.
              </p>

              {genResults.map((tpl, ti) => (
                <div key={ti} className="border border-border rounded-lg p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold">{tpl.name}</p>
                    {tpl.description && <p className="text-xs text-muted-foreground">{tpl.description}</p>}
                  </div>
                  {tpl.roles.map((role, ri) => (
                    <div key={ri} className="bg-muted rounded p-3 space-y-1">
                      <p className="text-sm font-medium">{role.role_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Invitation J-{role.invitation_delay_days} · {role.form_questions.length} question(s)
                      </p>
                      {role.form_questions.map((q, qi) => (
                        <p key={qi} className="text-xs text-muted-foreground pl-2 border-l border-border">
                          {q.label}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              <DialogFooter>
                <Button variant="outline" onClick={() => setGenResults(null)}>Modifier la description</Button>
                <Button onClick={handleSaveGenerated} disabled={createTemplate.isPending}>
                  {createTemplate.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sauvegarde…</>
                  ) : (
                    <>Sauvegarder {genResults.length} template(s)</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export function WorkflowsPage() {
  const [selectedSector, setSelectedSector] = useState<TenantSector | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les templates de procédure par secteur d'activité
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sector list */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
            Secteurs
          </p>
          {SECTOR_PRESETS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSelectedSector(s.key)}
              className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                selectedSector === s.key
                  ? "bg-primary/5 border border-primary/20"
                  : "hover:bg-accent border border-transparent"
              }`}
            >
              <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Template manager for selected sector */}
        <div>
          {selectedSector ? (
            <div className="bg-background rounded-xl border border-border p-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold">
                  {SECTOR_PRESETS.find((s) => s.key === selectedSector)?.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Ces templates seront copiés lors du provisionnement d'un nouveau client de ce secteur.
                </p>
              </div>
              <SectorTemplateManager sector={selectedSector} />
            </div>
          ) : (
            <div className="bg-background rounded-xl border border-border p-12 text-center text-muted-foreground">
              <Settings2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sélectionnez un secteur pour gérer ses workflows</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
