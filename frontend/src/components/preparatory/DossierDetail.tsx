import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useDossier, useUpdateDossier } from "@/api/hooks/usePreparatoryPhases";
import { AgendaEditor } from "./AgendaEditor";
import { DocumentUpload } from "./DocumentUpload";
import type { DossierStatus } from "@/api/types";

const STATUS_OPTIONS: { value: DossierStatus; label: string }[] = [
  { value: "draft", label: "Brouillon" },
  { value: "ready", label: "Prêt" },
  { value: "archived", label: "Archivé" },
];

interface DossierDetailProps {
  dossierId: string;
  onBack: () => void;
}

export function DossierDetail({ dossierId, onBack }: DossierDetailProps) {
  const { data: dossier, isLoading } = useDossier(dossierId);
  const updateDossier = useUpdateDossier();

  if (isLoading || !dossier) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleUpdate = (field: string, value: string | null) => {
    updateDossier.mutate({ id: dossierId, body: { [field]: value } });
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Retour à la liste
      </Button>

      <div className="space-y-6">
        {/* Header */}
        <div className="bg-background rounded-xl border border-border p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Titre</Label>
              <Input
                className="mt-1"
                defaultValue={dossier.title}
                onBlur={(e) => {
                  if (e.target.value !== dossier.title) handleUpdate("title", e.target.value);
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date prévue</Label>
              <Input
                type="datetime-local"
                className="mt-1"
                defaultValue={dossier.meeting_date ? dossier.meeting_date.slice(0, 16) : ""}
                onBlur={(e) => {
                  const val = e.target.value || null;
                  if (val !== (dossier.meeting_date?.slice(0, 16) ?? null)) {
                    handleUpdate("meeting_date", val ? new Date(val).toISOString() : null);
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Statut</Label>
              <Select
                value={dossier.status}
                onValueChange={(v) => handleUpdate("status", v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                className="mt-1"
                defaultValue={dossier.description ?? ""}
                placeholder="Description optionnelle..."
                onBlur={(e) => {
                  const val = e.target.value || null;
                  if (val !== (dossier.description ?? null)) handleUpdate("description", val);
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <span>Créé le {new Date(dossier.created_at).toLocaleDateString("fr-FR")}</span>
            {updateDossier.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
        </div>

        {/* Agenda */}
        <div className="bg-background rounded-xl border border-border p-5">
          <AgendaEditor dossierId={dossierId} points={dossier.agenda_points} />
        </div>

        {/* Documents généraux */}
        <div className="bg-background rounded-xl border border-border p-5">
          <DocumentUpload
            dossierId={dossierId}
            documents={dossier.documents}
            label="Documents"
          />
        </div>

        {/* Documents par point */}
        {dossier.agenda_points.length > 0 && (
          <div className="bg-background rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-4">Documents par point</h3>
            <div className="space-y-4">
              {dossier.agenda_points.map((point, idx) => (
                <div key={point.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">{idx + 1}</Badge>
                    <span className="text-sm font-medium">{point.title}</span>
                  </div>
                  <DocumentUpload
                    dossierId={dossierId}
                    agendaPointId={point.id}
                    documents={dossier.documents}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
