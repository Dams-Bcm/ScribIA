import { useState } from "react";
import { Loader2, Plus, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  useRGPDRequests,
  useCreateRGPDRequest,
  useUpdateRGPDRequest,
} from "@/api/hooks/useCompliance";
import type { RGPDRequest } from "@/api/types";

const REQUEST_TYPES: Record<string, string> = {
  access: "Droit d'accès (Art. 15)",
  rectification: "Rectification (Art. 16)",
  deletion: "Suppression (Art. 17)",
  portability: "Portabilité (Art. 20)",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning" }> = {
  pending: { label: "En attente", variant: "warning" },
  in_progress: { label: "En cours", variant: "default" },
  completed: { label: "Terminée", variant: "success" },
  rejected: { label: "Rejetée", variant: "destructive" },
};

function isOverdue(request: RGPDRequest): boolean {
  if (request.status === "completed" || request.status === "rejected") return false;
  const created = new Date(request.created_at);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 30;
}

function daysRemaining(request: RGPDRequest): number {
  const created = new Date(request.created_at);
  const deadline = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function RGPDRequests() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { data: requests, isLoading } = useRGPDRequests(statusFilter);
  const createRequest = useCreateRGPDRequest();
  const updateRequest = useUpdateRGPDRequest();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<RGPDRequest | null>(null);
  const [newForm, setNewForm] = useState({ request_type: "", user_id: "", notes: "" });
  const [updateStatus, setUpdateStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  const handleCreate = () => {
    createRequest.mutate(
      { request_type: newForm.request_type, user_id: newForm.user_id, notes: newForm.notes || undefined },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setNewForm({ request_type: "", user_id: "", notes: "" });
        },
      },
    );
  };

  const openDetail = (req: RGPDRequest) => {
    setDetailRequest(req);
    setUpdateStatus(req.status);
    setAdminNotes(req.admin_notes ?? "");
  };

  const handleUpdate = () => {
    if (!detailRequest) return;
    updateRequest.mutate(
      { id: detailRequest.id, body: { status: updateStatus, admin_notes: adminNotes || undefined } },
      { onSuccess: () => setDetailRequest(null) },
    );
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
        <div className="flex items-center gap-2">
          <Select value={statusFilter ?? "all"} onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="completed">Terminées</SelectItem>
              <SelectItem value="rejected">Rejetées</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nouvelle demande
        </Button>
      </div>

      {!requests || requests.length === 0 ? (
        <div className="bg-background rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Aucune demande RGPD.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const overdue = isOverdue(req);
            const remaining = daysRemaining(req);
            const statusCfg = STATUS_CONFIG[req.status] ?? { label: "Inconnu", variant: "secondary" as const };

            return (
              <div
                key={req.id}
                className={`bg-background rounded-xl border p-4 cursor-pointer hover:bg-accent/50 transition-colors ${
                  overdue ? "border-red-300" : "border-border"
                }`}
                onClick={() => openDetail(req)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {REQUEST_TYPES[req.request_type] ?? req.request_type}
                      </span>
                      <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          Délai dépassé
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Utilisateur : {req.user_id.slice(0, 8)}...</span>
                      <span>Créée le {new Date(req.created_at).toLocaleDateString("fr-FR")}</span>
                      {req.status !== "completed" && req.status !== "rejected" && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {remaining > 0 ? `${remaining}j restants` : `${Math.abs(remaining)}j de retard`}
                        </span>
                      )}
                    </div>
                    {req.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{req.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle demande RGPD</DialogTitle>
            <DialogDescription>Enregistrez une demande formelle au nom d'un utilisateur.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type de demande</Label>
              <Select value={newForm.request_type} onValueChange={(v) => setNewForm((f) => ({ ...f, request_type: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REQUEST_TYPES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ID utilisateur</Label>
              <Input
                className="mt-1"
                value={newForm.user_id}
                onChange={(e) => setNewForm((f) => ({ ...f, user_id: e.target.value }))}
                placeholder="UUID de l'utilisateur"
              />
            </div>
            <div>
              <Label>Notes (optionnel)</Label>
              <Input
                className="mt-1"
                value={newForm.notes}
                onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Contexte de la demande"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              onClick={handleCreate}
              disabled={!newForm.request_type || !newForm.user_id || createRequest.isPending}
            >
              {createRequest.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog détail/mise à jour */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demande RGPD</DialogTitle>
            <DialogDescription>
              {detailRequest && (REQUEST_TYPES[detailRequest.request_type] ?? detailRequest.request_type)}
            </DialogDescription>
          </DialogHeader>
          {detailRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Utilisateur</span>
                  <p className="font-medium">{detailRequest.user_id.slice(0, 8)}...</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Créée le</span>
                  <p className="font-medium">{new Date(detailRequest.created_at).toLocaleDateString("fr-FR")}</p>
                </div>
                {detailRequest.completed_at && (
                  <div>
                    <span className="text-muted-foreground">Terminée le</span>
                    <p className="font-medium">{new Date(detailRequest.completed_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                )}
              </div>
              {detailRequest.notes && (
                <div>
                  <Label>Notes du demandeur</Label>
                  <p className="text-sm mt-1 p-2 bg-muted rounded-lg">{detailRequest.notes}</p>
                </div>
              )}
              <div>
                <Label>Statut</Label>
                <Select value={updateStatus} onValueChange={setUpdateStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="in_progress">En cours</SelectItem>
                    <SelectItem value="completed">Terminée</SelectItem>
                    <SelectItem value="rejected">Rejetée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes admin</Label>
                <Input
                  className="mt-1"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Commentaire sur le traitement"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailRequest(null)}>Fermer</Button>
            <Button onClick={handleUpdate} disabled={updateRequest.isPending}>
              {updateRequest.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Mettre à jour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
