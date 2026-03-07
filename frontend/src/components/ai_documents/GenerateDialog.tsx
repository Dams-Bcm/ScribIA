import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useTemplates, useGenerateDocument } from "@/api/hooks/useAIDocuments";
import { useDossiers } from "@/api/hooks/usePreparatoryPhases";
import { useAuth } from "@/stores/auth";
import type { AIDocument } from "@/api/types";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

function useTranscriptionSessions() {
  return useQuery({
    queryKey: ["ai-documents-source-sessions"],
    queryFn: () =>
      api.get<Array<{ id: string; title: string; original_filename: string; created_at: string; mode: string }>>(
        "/ai-documents/sources/sessions"
      ),
  });
}

interface Props {
  onGenerated: (doc: AIDocument) => void;
}

export function GenerateDialog({ onGenerated }: Props) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { hasModule } = useAuth();
  const hasPrepModule = hasModule("preparatory_phases");
  const { data: templates = [] } = useTemplates();
  const { data: dossiers = [] } = useDossiers();
  const { data: sessions = [] } = useTranscriptionSessions();
  const generate = useGenerateDocument();

  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function handleGenerate() {
    if (!templateId || !title) return;
    const result = await generate.mutateAsync({
      template_id: templateId,
      title,
      source_dossier_id: dossierId,
      source_session_id: sessionId,
    });
    onGenerated(result);
    setOpen(false);
    setTemplateId("");
    setTitle("");
    setDossierId(null);
    setSessionId(null);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Sparkles className="w-4 h-4 mr-2" />
        Générer un document
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Générer un document IA</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Template *</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate?.description && (
                <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Titre du document *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Réunion du 15/03/2026"
              />
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Sources (optionnelles)
              </p>

              {hasPrepModule && (
              <div className="space-y-1">
                <Label>Dossier préparatoire</Label>
                <Select
                  value={dossierId ?? "__none__"}
                  onValueChange={(v) => setDossierId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun dossier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucun</SelectItem>
                    {dossiers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                        {d.meeting_date && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {new Date(d.meeting_date).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}

              <div className="space-y-1">
                <Label>Session de transcription</Label>
                <Select
                  value={sessionId ?? "__none__"}
                  onValueChange={(v) => setSessionId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Aucune transcription" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune</SelectItem>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title || s.original_filename}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {s.mode === "diarisation" ? "[T+D] " : "[T] "}
                          {new Date(s.created_at).toLocaleDateString("fr-FR")}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              onClick={handleGenerate}
              disabled={!templateId || !title || generate.isPending}
            >
              {generate.isPending ? "Lancement…" : "Générer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
