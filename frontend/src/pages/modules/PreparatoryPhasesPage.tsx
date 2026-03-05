import { useState } from "react";
import { FolderOpen, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useDossiers, useCreateDossier, useDeleteDossier } from "@/api/hooks/usePreparatoryPhases";
import { DossierList } from "@/components/preparatory/DossierList";
import { DossierDetail } from "@/components/preparatory/DossierDetail";

export function PreparatoryPhasesPage() {
  const { data: dossiers = [], isLoading } = useDossiers();
  const createDossier = useCreateDossier();
  const deleteDossier = useDeleteDossier();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", meeting_date: "" });

  const handleCreate = () => {
    createDossier.mutate(
      {
        title: form.title,
        description: form.description || undefined,
        meeting_date: form.meeting_date ? new Date(form.meeting_date).toISOString() : undefined,
      },
      {
        onSuccess: (data) => {
          setCreateOpen(false);
          setForm({ title: "", description: "", meeting_date: "" });
          setSelectedId(data.id);
        },
      },
    );
  };

  if (selectedId) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
            <FolderOpen className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold">Dossier préparatoire</h1>
        </div>
        <p className="text-muted-foreground mb-6">Ordre du jour et documents</p>
        <DossierDetail dossierId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
          <FolderOpen className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-bold">Phase(s) préparatoire(s)</h1>
      </div>
      <p className="text-muted-foreground mb-6">Gérez vos dossiers préparatoires</p>

      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nouveau dossier
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : dossiers.length === 0 ? (
        <div className="bg-background rounded-xl border border-border p-8">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Aucun dossier</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Créez votre premier dossier préparatoire pour organiser vos réunions.
            </p>
          </div>
        </div>
      ) : (
        <DossierList
          dossiers={dossiers}
          onSelect={setSelectedId}
          onDelete={(id) => deleteDossier.mutate(id)}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau dossier préparatoire</DialogTitle>
            <DialogDescription>Créez un dossier pour préparer une réunion ou un événement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titre</Label>
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Réunion d'équipe du 15 mars"
              />
            </div>
            <div>
              <Label>Description (optionnel)</Label>
              <Input
                className="mt-1"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Contexte ou objectif"
              />
            </div>
            <div>
              <Label>Date prévue (optionnel)</Label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={form.meeting_date}
                onChange={(e) => setForm((f) => ({ ...f, meeting_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={!form.title.trim() || createDossier.isPending}>
              {createDossier.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
