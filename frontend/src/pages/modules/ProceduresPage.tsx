import { useState } from "react";
import { ProcedureList } from "@/components/procedures/ProcedureList";
import { ProcedureDetail } from "@/components/procedures/ProcedureDetail";
import { CreateProcedureDialog } from "@/components/procedures/CreateProcedureDialog";
import type { Procedure } from "@/api/types";

export function ProceduresPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleCreated(proc: Procedure) {
    setSelectedId(proc.id);
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Procédures collaboratives</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Invitations, collecte de contributions, planification et génération de documents
          </p>
        </div>
        <CreateProcedureDialog onCreated={handleCreated} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">
        {/* Liste */}
        <div className="border border-border rounded-lg p-3 overflow-y-auto">
          <ProcedureList
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Détail */}
        <div className="border border-border rounded-lg p-4 overflow-y-auto">
          {selectedId ? (
            <ProcedureDetail procedureId={selectedId} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Sélectionnez une procédure pour voir le détail
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
