import { Trash2, FileText, Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAIDocuments, useDeleteAIDocument } from "@/api/hooks/useAIDocuments";
import type { AIDocumentListItem, AIDocumentStatus } from "@/api/types";

const STATUS_CONFIG: Record<AIDocumentStatus, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending:    { label: "En attente",  icon: <Clock className="w-3 h-3" />,          variant: "secondary" },
  generating: { label: "En cours",    icon: <Loader2 className="w-3 h-3 animate-spin" />, variant: "default" },
  completed:  { label: "Terminé",     icon: <CheckCircle2 className="w-3 h-3" />,   variant: "outline" },
  error:      { label: "Erreur",      icon: <XCircle className="w-3 h-3" />,        variant: "destructive" },
};

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DocumentList({ selectedId, onSelect }: Props) {
  const { data: documents = [], isLoading } = useAIDocuments();
  const deleteDoc = useDeleteAIDocument();

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  if (documents.length === 0) {
    return (
      <div className="text-center py-10">
        <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Aucun document généré</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {documents.map((doc) => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          selected={selectedId === doc.id}
          onSelect={() => onSelect(doc.id)}
          onDelete={() => deleteDoc.mutate(doc.id)}
        />
      ))}
    </div>
  );
}

function DocumentRow({
  doc,
  selected,
  onSelect,
  onDelete,
}: {
  doc: AIDocumentListItem;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { label, icon, variant } = STATUS_CONFIG[doc.status];

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        selected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
      }`}
      onClick={onSelect}
    >
      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.title}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(doc.created_at).toLocaleDateString("fr-FR", {
            day: "2-digit", month: "short", year: "numeric",
          })}
        </p>
      </div>
      <Badge variant={variant} className="flex items-center gap-1 text-xs flex-shrink-0">
        {icon}
        {label}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0 text-muted-foreground hover:text-destructive"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
