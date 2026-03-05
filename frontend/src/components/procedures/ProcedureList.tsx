import { ClipboardList, Trash2, Users, CheckCircle2, Clock, Loader2, CalendarCheck, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProcedures, useDeleteProcedure } from "@/api/hooks/useProcedures";
import type { ProcedureListItem, ProcedureStatus } from "@/api/types";

const STATUS_CONFIG: Record<ProcedureStatus, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:      { label: "Brouillon",   icon: <Clock className="w-3 h-3" />,                        variant: "secondary" },
  collecting: { label: "Collecte",    icon: <Loader2 className="w-3 h-3 animate-spin" />,         variant: "default" },
  scheduled:  { label: "Planifiée",   icon: <CalendarCheck className="w-3 h-3" />,                variant: "outline" },
  meeting:    { label: "Réunion",     icon: <Mic className="w-3 h-3" />,                          variant: "outline" },
  generating: { label: "Génération",  icon: <Sparkles className="w-3 h-3 animate-pulse" />,       variant: "default" },
  done:       { label: "Terminée",    icon: <CheckCircle2 className="w-3 h-3" />,                 variant: "outline" },
};

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ProcedureList({ selectedId, onSelect }: Props) {
  const { data: procedures = [], isLoading } = useProcedures();
  const deleteProcedure = useDeleteProcedure();

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  if (procedures.length === 0) {
    return (
      <div className="text-center py-10">
        <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Aucune procédure créée</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {procedures.map((proc) => (
        <ProcedureRow
          key={proc.id}
          proc={proc}
          selected={selectedId === proc.id}
          onSelect={() => onSelect(proc.id)}
          onDelete={() => deleteProcedure.mutate(proc.id)}
        />
      ))}
    </div>
  );
}

function ProcedureRow({
  proc,
  selected,
  onSelect,
  onDelete,
}: {
  proc: ProcedureListItem;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { label, icon, variant } = STATUS_CONFIG[proc.status];

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        selected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
      }`}
      onClick={onSelect}
    >
      <ClipboardList className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{proc.title}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="w-3 h-3" />
          {proc.response_count}/{proc.participant_count} réponses
          {proc.meeting_date && (
            <span className="ml-2">
              · {new Date(proc.meeting_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
            </span>
          )}
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
