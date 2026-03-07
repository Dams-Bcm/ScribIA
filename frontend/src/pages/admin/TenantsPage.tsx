import { useState } from "react";
import {
  useTenants,
  useCreateTenant,
  useDeleteTenant,
  useUpdateTenant,
  useUpdateTenantModules,
  useProvisionTenant,
  useProvisionDedicatedDb,
  useDeprovisionDedicatedDb,
} from "../../api/hooks/useTenants";
import { AVAILABLE_MODULES, type Tenant, type ProvisionResult } from "../../api/types";
import { useSectors } from "../../api/hooks/useSectors";
import { Building2, Plus, Trash2, X, CheckCircle2, Sparkles, Database, Loader2, Save } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function TenantsPage() {
  const { data: tenants = [], isLoading } = useTenants();
  const createTenant = useCreateTenant();
  const deleteTenant = useDeleteTenant();
  const updateTenant = useUpdateTenant();
  const updateModules = useUpdateTenantModules();
  const provisionTenant = useProvisionTenant();
  const provisionDb = useProvisionDedicatedDb();
  const deprovisionDb = useDeprovisionDedicatedDb();

  const { data: sectors = [] } = useSectors();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", tenant_type: "organization" as string, sector: null as string | null, modules: [] as string[] });
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);

  function handleSectorChange(sector: string | null) {
    const preset = sector ? sectors.find((p) => p.key === sector) : null;
    setForm((f) => ({ ...f, sector, modules: preset ? preset.default_modules : [] }));
  }

  const selected = tenants.find((t) => t.id === selectedId) ?? null;

  const groups = tenants.filter((t) => t.tenant_type === "group");
  const organizations = tenants.filter((t) => t.tenant_type === "organization");

  function handleCreate() {
    createTenant.mutate(
      { name: form.name, slug: form.slug.toLowerCase().replace(/\s+/g, "-"), tenant_type: form.tenant_type, sector: form.sector, modules: form.modules },
      {
        onSuccess: (newTenant) => {
          if (form.sector) {
            provisionTenant.mutate(newTenant.id, {
              onSuccess: (result) => {
                setProvisionResult(result);
                setForm({ name: "", slug: "", tenant_type: "organization", sector: null, modules: [] });
              },
              onError: () => {
                setShowCreate(false);
                setForm({ name: "", slug: "", tenant_type: "organization", sector: null, modules: [] });
              },
            });
          } else {
            setShowCreate(false);
            setForm({ name: "", slug: "", tenant_type: "organization", sector: null, modules: [] });
          }
        },
      },
    );
  }

  function handleDelete(id: string) {
    confirm({
      title: "Supprimer ce tenant et toutes ses données ?",
      confirmLabel: "Supprimer",
      onConfirm: () => {
        deleteTenant.mutate(id);
        if (selectedId === id) setSelectedId(null);
      },
    });
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
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} tenant{tenants.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau client
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

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1 mt-4">Tenants</p>
          {organizations.filter((o) => !o.parent_id).map((o) => (
            <OrgRow key={o.id} tenant={o} selected={selectedId === o.id} onSelect={(t) => setSelectedId(t.id)} onDelete={handleDelete} />
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-background rounded-xl border border-border p-6">
              <h2 className="text-lg font-bold mb-1">{selected.name}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {selected.slug} &middot; {selected.tenant_type === "group" ? "Groupe" : "Organisation"}
                {selected.sector && (
                  <> &middot; <span className="font-medium text-foreground">{sectors.find((s) => s.key === selected.sector)?.label ?? selected.sector}</span></>
                )}
              </p>

              {selected.sector && (
                <button
                  onClick={() => provisionTenant.mutate(selected.id, { onSuccess: setProvisionResult })}
                  disabled={provisionTenant.isPending}
                  className="flex items-center gap-2 mb-4 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {provisionTenant.isPending ? "Provisionnement…" : "Provisionner les templates"}
                </button>
              )}

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

              {/* Prompt Whisper */}
              <WhisperPromptEditor tenant={selected} onSave={(prompt) => updateTenant.mutate({ id: selected.id, data: { whisper_initial_prompt: prompt } })} saving={updateTenant.isPending} />

              {/* Base de données dédiée */}
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Base de données
                </h3>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    selected.db_mode === "dedicated"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <Database className="w-3 h-3" />
                    {selected.db_mode === "dedicated" ? "Dédiée" : "Partagée"}
                  </span>
                  {selected.dedicated_db_name && (
                    <span className="text-xs text-muted-foreground font-mono">{selected.dedicated_db_name}</span>
                  )}
                </div>

                {selected.db_mode === "shared" ? (
                  <button
                    onClick={() => {
                      confirm({
                        title: `Migrer "${selected.name}" vers une BDD dédiée ?`,
                        description: "Cela va créer une nouvelle base de données, migrer toutes les données existantes et rediriger automatiquement les requêtes.",
                        confirmLabel: "Migrer",
                        variant: "default",
                        onConfirm: () => provisionDb.mutate(selected.id),
                      });
                    }}
                    disabled={provisionDb.isPending}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 text-sm hover:bg-blue-100 transition-colors disabled:opacity-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                  >
                    {provisionDb.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Migration en cours...</>
                    ) : (
                      <><Database className="w-3.5 h-3.5" /> Passer en BDD dédiée</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      confirm({
                        title: `Rapatrier "${selected.name}" vers la BDD partagée ?`,
                        description: "Cela va migrer toutes les données vers la base commune.",
                        confirmLabel: "Rapatrier",
                        variant: "default",
                        onConfirm: () => deprovisionDb.mutate(selected.id),
                      });
                    }}
                    disabled={deprovisionDb.isPending}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {deprovisionDb.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rapatriement en cours...</>
                    ) : (
                      "Revenir en BDD partagée"
                    )}
                  </button>
                )}

                {(provisionDb.isError || deprovisionDb.isError) && (
                  <p className="mt-2 text-sm text-destructive">
                    {(provisionDb.error ?? deprovisionDb.error) instanceof Error
                      ? (provisionDb.error ?? deprovisionDb.error)!.message
                      : "Erreur lors de la migration"}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-background rounded-xl border border-border p-12 text-center text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sélectionnez un tenant</p>
            </div>
          )}
        </div>
      </div>

      {/* Create / Provision modal */}
      {confirmDialog}
      {(showCreate || provisionResult) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl border border-border p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">

            {/* ── Résultat de provisionnement ── */}
            {provisionResult ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Client créé</h2>
                  <button onClick={() => setProvisionResult(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
                </div>
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                  <p className="font-semibold">Provisionnement terminé</p>
                  <p className="text-sm text-muted-foreground">
                    {sectors.find((s) => s.key === provisionResult.sector)?.label ?? provisionResult.sector}
                  </p>
                </div>
                <div className="space-y-3 mt-2">
                  {provisionResult.procedure_templates.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Templates de procédure</p>
                      {provisionResult.procedure_templates.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 text-sm py-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          {t.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {provisionResult.document_templates.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Templates de documents IA</p>
                      {provisionResult.document_templates.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 text-sm py-1">
                          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                          {t.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setProvisionResult(null)}
                  className="w-full mt-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Fermer
                </button>
              </>
            ) : (
              /* ── Formulaire de création ── */
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Nouveau client</h2>
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
                      placeholder="Cabinet Gestion ABC"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">Slug</label>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="cabinet-gestion-abc"
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
                    <label className="block text-sm font-medium mb-1.5">
                      Secteur <span className="text-muted-foreground font-normal">(génère les templates automatiquement)</span>
                    </label>
                    <select
                      value={form.sector ?? ""}
                      onChange={(e) => handleSectorChange(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— Générique (sans provisionnement) —</option>
                      {sectors.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                    {form.sector && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Les templates de procédures et de documents IA seront créés automatiquement.
                      </p>
                    )}
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
                    disabled={!form.name || !form.slug || createTenant.isPending || provisionTenant.isPending}
                    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {provisionTenant.isPending ? "Provisionnement…" : createTenant.isPending ? "Création…" : form.sector ? "Créer et provisionner" : "Créer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WhisperPromptEditor({ tenant, onSave, saving }: { tenant: Tenant; onSave: (prompt: string) => void; saving: boolean }) {
  const [draft, setDraft] = useState(tenant.whisper_initial_prompt ?? "");
  const [prevId, setPrevId] = useState(tenant.id);

  // Reset draft when switching tenants
  if (tenant.id !== prevId) {
    setPrevId(tenant.id);
    setDraft(tenant.whisper_initial_prompt ?? "");
  }

  const hasChanges = draft !== (tenant.whisper_initial_prompt ?? "");

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <h3 className="text-sm font-semibold mb-1">Vocabulaire Whisper</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Noms propres, acronymes et termes métier pour améliorer la transcription.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        placeholder="Ex : Jean Dupont, CHSCT, conseil syndical, ravalement de façade…"
      />
      {hasChanges && (
        <button
          onClick={() => onSave(draft)}
          disabled={saving}
          className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
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
        {tenant.db_mode === "dedicated" && (
          <Database className="w-3 h-3 text-blue-500 shrink-0" />
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
