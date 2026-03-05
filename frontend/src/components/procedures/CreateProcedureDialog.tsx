import React, { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useProcedureTemplates, useCreateProcedure } from "@/api/hooks/useProcedures";
import { useTemplates } from "@/api/hooks/useAIDocuments";
import type { Procedure } from "@/api/types";

interface Props {
  onCreated: (proc: Procedure) => void;
}

export function CreateProcedureDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [docTemplateId, setDocTemplateId] = useState<string | null>(null);

  const { data: procTemplates = [] } = useProcedureTemplates();
  const { data: docTemplates = [] } = useTemplates();
  const create = useCreateProcedure();

  const selectedProcTemplate = procTemplates.find((t) => t.id === templateId);

  async function handleCreate() {
    if (!title.trim()) return;
    const proc = await create.mutateAsync({
      title: title.trim(),
      description: description.trim() || null,
      template_id: templateId,
      document_template_id: docTemplateId ?? selectedProcTemplate?.document_template_id ?? null,
    });
    onCreated(proc);
    setOpen(false);
    setTitle("");
    setDescription("");
    setTemplateId(null);
    setDocTemplateId(null);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ClipboardList className="w-4 h-4 mr-2" />
        Nouvelle procédure
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle procédure</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Titre *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Réunion de chantier — lot 3 — mars 2026"
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                placeholder="Objet de la réunion, contexte…"
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <Label>Template de procédure</Label>
              <Select
                value={templateId ?? "__none__"}
                onValueChange={(v) => setTemplateId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {procTemplates.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProcTemplate?.description && (
                <p className="text-xs text-muted-foreground">{selectedProcTemplate.description}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Document à générer</Label>
              <Select
                value={docTemplateId ?? selectedProcTemplate?.document_template_id ?? "__none__"}
                onValueChange={(v) => setDocTemplateId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun document" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {docTemplates.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
