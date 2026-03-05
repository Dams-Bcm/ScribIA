import { Eye, Trash2, Calendar, FileText, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PreparatoryDossier } from "@/api/types";

const STATUS_MAP: Record<string, { label: string; variant: "secondary" | "success" | "warning" }> = {
  draft: { label: "Brouillon", variant: "secondary" },
  ready: { label: "Prêt", variant: "success" },
  archived: { label: "Archivé", variant: "warning" },
};

interface DossierListProps {
  dossiers: PreparatoryDossier[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DossierList({ dossiers, onSelect, onDelete }: DossierListProps) {
  return (
    <div className="bg-background rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Titre</th>
            <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Statut</th>
            <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Date</th>
            <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">Points</th>
            <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">Docs</th>
            <th className="text-right px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {dossiers.map((d) => {
            const statusCfg = STATUS_MAP[d.status] ?? { label: d.status, variant: "secondary" as const };
            return (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <button
                    className="font-medium text-left hover:underline"
                    onClick={() => onSelect(d.id)}
                  >
                    {d.title}
                  </button>
                  {d.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{d.description}</p>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                  {d.meeting_date ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(d.meeting_date).toLocaleDateString("fr-FR")}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <List className="w-3.5 h-3.5" />
                    {d.point_count}
                  </span>
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <FileText className="w-3.5 h-3.5" />
                    {d.document_count}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onSelect(d.id)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Supprimer ce dossier ?")) onDelete(d.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
