import { useState } from "react";
import { useTenants } from "../../api/hooks/useTenants";
import { ProcedureTemplateManager } from "../../components/procedures/ProcedureTemplateManager";
import { Building2 } from "lucide-react";

export function WorkflowsPage() {
  const { data: tenants = [], isLoading } = useTenants();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les templates de procédure par organisation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Tenant list */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
            Organisations
          </p>
          {tenants.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTenantId(t.id)}
              className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                selectedTenantId === t.id
                  ? "bg-primary/5 border border-primary/20"
                  : "hover:bg-accent border border-transparent"
              }`}
            >
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>

        {/* Template manager */}
        <div>
          {selectedTenantId ? (
            <div className="bg-background rounded-xl border border-border p-6">
              <ProcedureTemplateManager tenantId={selectedTenantId} />
            </div>
          ) : (
            <div className="bg-background rounded-xl border border-border p-12 text-center text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sélectionnez une organisation pour gérer ses workflows</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
