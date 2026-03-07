import { useState } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  useAddPoint,
  useUpdatePoint,
  useDeletePoint,
  useReorderPoints,
} from "@/api/hooks/usePreparatoryPhases";
import type { AgendaPoint } from "@/api/types";

interface AgendaEditorProps {
  dossierId: string;
  points: AgendaPoint[];
}

export function AgendaEditor({ dossierId, points }: AgendaEditorProps) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const addPoint = useAddPoint();
  const updatePoint = useUpdatePoint();
  const deletePoint = useDeletePoint();
  const reorderPoints = useReorderPoints();

  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addPoint.mutate(
      { dossierId, body: { title: newTitle.trim() } },
      { onSuccess: () => setNewTitle("") },
    );
  };

  const startEdit = (point: AgendaPoint) => {
    setEditingId(point.id);
    setEditTitle(point.title);
  };

  const saveEdit = () => {
    if (!editingId || !editTitle.trim()) return;
    updatePoint.mutate(
      { dossierId, pointId: editingId, body: { title: editTitle.trim() } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const cancelEdit = () => setEditingId(null);

  const handleDelete = (pointId: string) => {
    confirm({
      title: "Supprimer ce point ?",
      confirmLabel: "Supprimer",
      onConfirm: () => deletePoint.mutate({ dossierId, pointId }),
    });
  };

  const movePoint = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= points.length) return;
    const ids = points.map((p) => p.id);
    [ids[index], ids[newIndex]] = [ids[newIndex]!, ids[index]!];
    reorderPoints.mutate({ dossierId, pointIds: ids });
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Ordre du jour</h3>

      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">Aucun point dans l'ordre du jour.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {points.map((point, idx) => (
            <div
              key={point.id}
              className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2"
            >
              <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">
                {idx + 1}.
              </span>

              {editingId === point.id ? (
                <>
                  <Input
                    className="h-7 text-sm flex-1"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                  />
                  <Button variant="ghost" size="sm" onClick={saveEdit} className="h-7 w-7 p-0">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 w-7 p-0">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm flex-1">{point.title}</span>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(point)} className="h-7 w-7 p-0">
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => movePoint(idx, -1)}
                    disabled={idx === 0}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => movePoint(idx, 1)}
                    disabled={idx === points.length - 1}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(point.id)} className="h-7 w-7 p-0">
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDialog}

      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          placeholder="Nouveau point..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <Button size="sm" onClick={handleAdd} disabled={!newTitle.trim() || addPoint.isPending}>
          <Plus className="w-4 h-4 mr-1" />
          Ajouter
        </Button>
      </div>
    </div>
  );
}
