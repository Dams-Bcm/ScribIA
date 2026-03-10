import { useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, Power, PowerOff, Globe, Building2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
} from "@/api/hooks/useAnnouncements";
import { useTenants } from "@/api/hooks/useTenants";
import type { Announcement, AnnouncementCreate, AnnouncementUpdate } from "@/api/types";

type FormData = {
  title: string;
  message: string;
  target_all: boolean;
  tenant_ids: string[];
};

const emptyForm: FormData = { title: "", message: "", target_all: true, tenant_ids: [] };

export function AnnouncementsPage() {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const { data: tenants = [] } = useTenants();
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const remove = useDeleteAnnouncement();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(ann: Announcement) {
    setEditingId(ann.id);
    setForm({
      title: ann.title,
      message: ann.message,
      target_all: ann.target_all,
      tenant_ids: ann.tenants.map((t) => t.id),
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      message: form.message,
      target_all: form.target_all,
      tenant_ids: form.target_all ? [] : form.tenant_ids,
    };
    if (editingId) {
      await update.mutateAsync({ id: editingId, data: payload as AnnouncementUpdate });
    } else {
      await create.mutateAsync(payload as AnnouncementCreate);
    }
    setShowForm(false);
  }

  function toggleTenant(tenantId: string) {
    setForm((f) => ({
      ...f,
      tenant_ids: f.tenant_ids.includes(tenantId)
        ? f.tenant_ids.filter((id) => id !== tenantId)
        : [...f.tenant_ids, tenantId],
    }));
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6" />
            Communications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Affichez un message aux utilisateurs lors de leur connexion
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Nouvelle annonce
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && announcements.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucune annonce pour le moment</p>
        </div>
      )}

      <div className="space-y-3">
        {announcements.map((ann) => (
          <div
            key={ann.id}
            className="bg-background rounded-xl border border-border p-4 flex items-start gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${ann.is_active ? "bg-green-500" : "bg-muted-foreground/30"}`}
                />
                <h3 className="font-semibold truncate">{ann.title}</h3>
                {ann.target_all ? (
                  <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Tous
                  </span>
                ) : (
                  <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {ann.tenants.length} tenant(s)
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{ann.message}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(ann.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title={ann.is_active ? "Desactiver" : "Activer"}
                onClick={() =>
                  update.mutate({ id: ann.id, data: { is_active: !ann.is_active } })
                }
              >
                {ann.is_active ? (
                  <PowerOff className="w-4 h-4 text-amber-500" />
                ) : (
                  <Power className="w-4 h-4 text-green-500" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => openEdit(ann)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive"
                onClick={() => remove.mutate(ann.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-lg">
                {editingId ? "Modifier l'annonce" : "Nouvelle annonce"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="text-sm font-medium">Titre</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Titre de l'annonce"
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Contenu du message..."
                    rows={5}
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Destinataires</label>
                  <div className="flex gap-3 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={form.target_all}
                        onChange={() => setForm({ ...form, target_all: true })}
                      />
                      <Globe className="w-4 h-4" />
                      <span className="text-sm">Tous les tenants</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!form.target_all}
                        onChange={() => setForm({ ...form, target_all: false })}
                      />
                      <Building2 className="w-4 h-4" />
                      <span className="text-sm">Tenants specifiques</span>
                    </label>
                  </div>
                </div>

                {!form.target_all && (
                  <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                    {tenants.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3">Aucun tenant disponible</p>
                    ) : (
                      tenants.map((t) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-0"
                        >
                          <Checkbox
                            checked={form.tenant_ids.includes(t.id)}
                            onCheckedChange={() => toggleTenant(t.id)}
                          />
                          <span className="text-sm">{t.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{t.slug}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !form.title.trim() ||
                    !form.message.trim() ||
                    (!form.target_all && form.tenant_ids.length === 0) ||
                    create.isPending ||
                    update.isPending
                  }
                >
                  {create.isPending || update.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : null}
                  {editingId ? "Enregistrer" : "Publier"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
