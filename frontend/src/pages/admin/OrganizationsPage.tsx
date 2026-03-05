import { useState } from "react";
import {
  useTenants,
  useCreateTenant,
  useDeleteTenant,
  useUpdateTenantModules,
} from "../../api/hooks/useTenants";
import { AVAILABLE_MODULES, type Tenant } from "../../api/types";
import { Building2, Plus, Trash2, X } from "lucide-react";

export function OrganizationsPage() {
  const { data: tenants = [], isLoading } = useTenants();
  const createTenant = useCreateTenant();
  const deleteTenant = useDeleteTenant();
  const updateModules = useUpdateTenantModules();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", tenant_type: "organization" as string, modules: [] as string[] });

  const selected = tenants.find((t) => t.id === selectedId) ?? null;

  const groups = tenants.filter((t) => t.tenant_type === "group");
  const organizations = tenants.filter((t) => t.tenant_type === "organization");

  function handleCreate() {
    createTenant.mutate(
      { name: form.name, slug: form.slug.toLowerCase().replace(/\s+/g, "-"), tenant_type: form.tenant_type, modules: form.modules },
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ name: "", slug: "", tenant_type: "organization", modules: [] });
        },
      },
    );
  }

  function handleDelete(id: string) {
    if (confirm("Supprimer cette organisation et toutes ses données ?")) {
      deleteTenant.mutate(id);
      if (selectedId === id) setSelectedId(null);
    }
  }

  function toggleModule(tenantId: string, moduleKey: string, currentlyEnabled: boolean) {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) return;
    const modules = AVAILABLE_MODULES.map((m) => ({
      module_key: m.key,
      enabled: m.key === moduleKey ? !currentlyEnabled : (tenant.modules.find((tm) => tm.module_key === m.key)?.enabled ?? false),
    }));
    updateModules.mutate({ tenantId, modules });
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organisations</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} organisation{tenants.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle organisation
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste */}
        <div className="lg:col-span-1 space-y-2">
          {groups.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">Groupes</p>
              {groups.map((g) => (
                <div key={g.id}>
                  <OrgRow tenant={g} selected={selectedId === g.id} onSelect={(t) => setSelectedId(t.id)} onDelete={handleDelete} />
                  {organizations.filter((o) => o.parent_id === g.id).map((o) => (
                    <div key={o.id} className="ml-4">
                      <OrgRow tenant={o} selected={selectedId === o.id} onSelect={(t) => setSelectedId(t.id)} onDelete={handleDelete} />
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1 mt-4">Organisations</p>
          {organizations.filter((o) => !o.parent_id).map((o) => (
            <OrgRow key={o.id} tenant={o} selected={selectedId === o.id} onSelect={(t) => setSelectedId(t.id)} onDelete={handleDelete} />
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-background rounded-xl border border-border p-6">
              <h2 className="text-lg font-bold mb-1">{selected.name}</h2>
              <p className="text-sm text-muted-foreground mb-4">{selected.slug} &middot; {selected.tenant_type === "group" ? "Groupe" : "Organisation"}</p>

              <h3 className="text-sm font-semibold mb-3">Modules activés</h3>
              <div className="space-y-2">
                {AVAILABLE_MODULES.map((mod) => {
                  const enabled = selected.modules.find((m) => m.module_key === mod.key)?.enabled ?? false;
                  return (
                    <label key={mod.key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleModule(selected.id, mod.key, enabled)}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-sm">{mod.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-background rounded-xl border border-border p-12 text-center text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sélectionnez une organisation</p>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl border border-border p-6 w-full max-w-md shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nouvelle organisation</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Nom</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Mon organisation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="mon-organisation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm({ ...form, tenant_type: "organization" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.tenant_type === "organization" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}
                  >
                    Organisation
                  </button>
                  <button
                    onClick={() => setForm({ ...form, tenant_type: "group" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.tenant_type === "group" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}
                  >
                    Groupe
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Modules</label>
                <div className="space-y-2">
                  {AVAILABLE_MODULES.map((mod) => (
                    <label key={mod.key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.modules.includes(mod.key)}
                        onChange={(e) => {
                          setForm({
                            ...form,
                            modules: e.target.checked
                              ? [...form.modules, mod.key]
                              : form.modules.filter((m) => m !== mod.key),
                          });
                        }}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-sm">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {createTenant.isError && (
                <p className="text-sm text-destructive">
                  {createTenant.error instanceof Error ? createTenant.error.message : "Erreur"}
                </p>
              )}

              <button
                onClick={handleCreate}
                disabled={!form.name || !form.slug || createTenant.isPending}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {createTenant.isPending ? "Création..." : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrgRow({
  tenant,
  selected,
  onSelect,
  onDelete,
}: {
  tenant: Tenant;
  selected: boolean;
  onSelect: (t: Tenant) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect(tenant)}
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        selected ? "bg-primary/5 border border-primary/20" : "hover:bg-accent border border-transparent"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{tenant.name}</span>
        {tenant.tenant_type === "group" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Groupe</span>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(tenant.id); }}
        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
