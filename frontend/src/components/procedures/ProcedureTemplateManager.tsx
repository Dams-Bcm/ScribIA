import React, { useState } from "react";
import { Plus, Trash2, Settings2, ChevronDown, ChevronUp } from "lucide-react";
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
import {
  useProcedureTemplates, useCreateProcedureTemplate,
  useDeleteProcedureTemplate,
} from "@/api/hooks/useProcedures";
import { useTemplates } from "@/api/hooks/useAIDocuments";
import type { FormQuestion, ProcedureTemplateRole } from "@/api/types";

const QUESTION_TYPES = [
  { value: "textarea", label: "Texte long" },
  { value: "text", label: "Texte court" },
];

export function ProcedureTemplateManager({ tenantId }: { tenantId?: string } = {}) {
  const { data: templates = [] } = useProcedureTemplates(tenantId);
  const { data: docTemplates = [] } = useTemplates();
  const createTemplate = useCreateProcedureTemplate(tenantId);
  const deleteTemplate = useDeleteProcedureTemplate(tenantId);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Formulaire création
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [docTemplateId, setDocTemplateId] = useState<string | null>(null);
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
    const newQ: FormQuestion = {
      id: crypto.randomUUID(),
      label: "",
      type: "textarea",
      options: [],
      required: false,
    };
    updateRole(roleIdx, "form_questions", [...(roles[roleIdx]?.form_questions ?? []), newQ]);
  }

  function updateQuestion(roleIdx: number, qIdx: number, field: string, value: unknown) {
    const qs = (roles[roleIdx]?.form_questions ?? []).map((q, i) =>
      i === qIdx ? { ...q, [field]: value } : q
    );
    updateRole(roleIdx, "form_questions", qs);
  }

  function removeQuestion(roleIdx: number, qIdx: number) {
    updateRole(roleIdx, "form_questions", (roles[roleIdx]?.form_questions ?? []).filter((_, i) => i !== qIdx));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    await createTemplate.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
      document_template_id: docTemplateId,
      roles,
    });
    setCreateOpen(false);
    setName(""); setDescription(""); setDocTemplateId(null); setRoles([]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Templates de procédure
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Nouveau template
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Aucun template. Créez-en un pour accélérer la création de procédures.
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
                <Button
                  variant="ghost" size="icon"
                  onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                >
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
                        Invitation J-{role.invitation_delay_days} ·{" "}
                        {role.form_questions.length} question(s)
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

      {/* Dialog création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau template de procédure</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nom *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Réunion ESS / GEVA-Sco" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label>Document à générer par défaut</Label>
              <Select value={docTemplateId ?? "__none__"} onValueChange={(v) => setDocTemplateId(v === "__none__" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {docTemplates.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      <Input
                        value={role.role_name}
                        onChange={(e) => updateRole(ri, "role_name", e.target.value)}
                        placeholder="Ex : Enseignant référent"
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Invitation (J-)</Label>
                      <Input
                        type="number"
                        value={role.invitation_delay_days}
                        onChange={(e) => updateRole(ri, "invitation_delay_days", parseInt(e.target.value) || 15)}
                        min={1}
                      />
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
                        <Input
                          className="flex-1 h-7 text-xs"
                          value={q.label}
                          onChange={(e) => updateQuestion(ri, qi, "label", e.target.value)}
                          placeholder="Libellé de la question…"
                        />
                        <Select value={q.type} onValueChange={(v) => updateQuestion(ri, qi, "type", v)}>
                          <SelectTrigger className="w-28 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
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
    </div>
  );
}
