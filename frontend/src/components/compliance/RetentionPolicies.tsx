import { useState } from "react";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useRetentionPolicies,
  useCreateRetentionPolicy,
  useUpdateRetentionPolicy,
  useDeleteRetentionPolicy,
} from "@/api/hooks/useCompliance";
import type { RetentionPolicy } from "@/api/types";

const DATA_TYPES = [
  { value: "audio_files", label: "Fichiers audio" },
  { value: "transcriptions", label: "Transcriptions" },
  { value: "user_data", label: "Données utilisateurs" },
  { value: "audit_logs", label: "Journaux d'audit" },
  { value: "consent_records", label: "Registres de consentement" },
  { value: "rgpd_requests", label: "Demandes RGPD" },
];

interface PolicyFormData {
  data_type: string;
  retention_days: string;
  auto_delete: string;
  description: string;
}

const EMPTY_FORM: PolicyFormData = {
  data_type: "",
  retention_days: "365",
  auto_delete: "false",
  description: "",
};

export function RetentionPolicies() {
  const { data: policies, isLoading } = useRetentionPolicies();
  const createPolicy = useCreateRetentionPolicy();
  const updatePolicy = useUpdateRetentionPolicy();
  const deletePolicy = useDeleteRetentionPolicy();

  const { confirm: confirmAction, dialog: confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RetentionPolicy | null>(null);
  const [form, setForm] = useState<PolicyFormData>(EMPTY_FORM);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (policy: RetentionPolicy) => {
    setEditing(policy);
    setForm({
      data_type: policy.data_type,
      retention_days: policy.retention_days,
      auto_delete: policy.auto_delete,
      description: policy.description ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editing) {
      updatePolicy.mutate(
        { id: editing.id, body: { retention_days: form.retention_days, auto_delete: form.auto_delete, description: form.description || undefined } },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createPolicy.mutate(
        { data_type: form.data_type, retention_days: form.retention_days, auto_delete: form.auto_delete, description: form.description || undefined },
        { onSuccess: () => setDialogOpen(false) },
      );
    }
  };

  const handleDelete = (id: string) => {
    confirmAction({
      title: "Supprimer cette politique de rétention ?",
      confirmLabel: "Supprimer",
      onConfirm: () => deletePolicy.mutate(id),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Définissez combien de temps chaque type de donnée est conservé.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Ajouter
        </Button>
      </div>

      {!policies || policies.length === 0 ? (
        <div className="bg-background rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Aucune politique de rétention configurée.</p>
        </div>
      ) : (
        <div className="bg-background rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Type de données</th>
                <th className="text-left px-4 py-3 font-medium">Durée</th>
                <th className="text-left px-4 py-3 font-medium">Suppression auto</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {DATA_TYPES.find((d) => d.value === p.data_type)?.label ?? p.data_type}
                  </td>
                  <td className="px-4 py-3">
                    {p.retention_days === "indefinite" ? "Indéfini" : `${p.retention_days} jours`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.auto_delete === "true"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {p.auto_delete === "true" ? "Oui" : "Non"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.description ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la politique" : "Nouvelle politique de rétention"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifiez les paramètres de cette politique de rétention."
                : "Configurez une nouvelle politique de rétention des données."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type de données</Label>
              <Select
                value={form.data_type}
                onValueChange={(v) => setForm((f) => ({ ...f, data_type: v }))}
                disabled={!!editing}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner un type" />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Durée de rétention (jours)</Label>
              <Input
                className="mt-1"
                value={form.retention_days}
                onChange={(e) => setForm((f) => ({ ...f, retention_days: e.target.value }))}
                placeholder="365 ou indefinite"
              />
            </div>
            <div>
              <Label>Suppression automatique</Label>
              <Select
                value={form.auto_delete}
                onValueChange={(v) => setForm((f) => ({ ...f, auto_delete: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Non</SelectItem>
                  <SelectItem value="true">Oui</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description (optionnel)</Label>
              <Input
                className="mt-1"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Conservation légale des PV"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleSave}
              disabled={!form.data_type || !form.retention_days || createPolicy.isPending || updatePolicy.isPending}
            >
              {(createPolicy.isPending || updatePolicy.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
