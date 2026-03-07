import { useState } from "react";
import {
  BookUser,
  Plus,
  Trash2,
  ChevronRight,
  ArrowLeft,
  UserPlus,
  Loader2,
  ShieldCheck,
  ShieldX,
  Send,
  Mic,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useContactGroups,
  useContactGroup,
  useCreateContactGroup,
  useDeleteContactGroup,
  useAddContact,
  useDeleteContact,
  useResetEnrollment,
} from "@/api/hooks/useContacts";
import { useSendConsentRequest } from "@/api/hooks/useConsent";
import type { ContactGroupCreate, ContactCreate } from "@/api/types";

// ── Group creation dialog (inline) ──────────────────────────────────────────

function CreateGroupForm({ onDone }: { onDone: () => void }) {
  const create = useCreateContactGroup();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: ContactGroupCreate = { name, description: description || null };
    create.mutate(body, { onSuccess: () => onDone() });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-background rounded-xl border border-border p-6 space-y-4">
      <h3 className="font-semibold">Nouveau groupe</h3>
      <div>
        <label className="text-sm font-medium">Nom *</label>
        <input
          className="w-full mt-1 px-3 py-2 border border-input rounded-lg text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Commission urbanisme"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium">Description</label>
        <input
          className="w-full mt-1 px-3 py-2 border border-input rounded-lg text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description du groupe (optionnel)"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim() || create.isPending} size="sm">
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Créer"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ── Add contact form ────────────────────────────────────────────────────────

function AddContactForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const add = useAddContact();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: ContactCreate & { groupId: string } = {
      groupId,
      name,
      email: email || null,
      phone: phone || null,
      role: role || null,
    };
    add.mutate(body, { onSuccess: () => { setName(""); setEmail(""); setPhone(""); setRole(""); onDone(); } });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-muted/50 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold">Ajouter un contact</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input className="px-3 py-2 border border-input rounded-lg text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom *" required />
        <input className="px-3 py-2 border border-input rounded-lg text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
        <input className="px-3 py-2 border border-input rounded-lg text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" />
        <input className="px-3 py-2 border border-input rounded-lg text-sm" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rôle (ex : Copropriétaire)" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!name.trim() || add.isPending}>
          {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ajouter"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ── Consent / Enrollment badges ─────────────────────────────────────────────

function ConsentBadge({ status, type }: { status: string | null; type: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    accepted: { label: "Accepté", cls: "bg-green-100 text-green-700", icon: <ShieldCheck className="w-3 h-3" /> },
    declined: { label: "Refusé", cls: "bg-red-100 text-red-700", icon: <ShieldX className="w-3 h-3" /> },
    sent: { label: "Envoyé", cls: "bg-yellow-100 text-yellow-700", icon: <Send className="w-3 h-3" /> },
    withdrawn: { label: "Retiré", cls: "bg-gray-100 text-gray-600", icon: <ShieldX className="w-3 h-3" /> },
  };
  const info = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
      {info.icon} {info.label}
      {type === "oral_recording" && <Mic className="w-3 h-3 ml-0.5" />}
    </span>
  );
}

function EnrollmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    enrolled: { label: "Enrollé", cls: "bg-purple-100 text-purple-700" },
    pending_online: { label: "En attente", cls: "bg-yellow-100 text-yellow-700" },
  };
  const info = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
      {info.label}
    </span>
  );
}

// ── Group detail view ───────────────────────────────────────────────────────

function GroupDetail({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const { data: group, isLoading } = useContactGroup(groupId);
  const deleteContact = useDeleteContact();
  const resetEnrollment = useResetEnrollment();
  const sendConsent = useSendConsentRequest();
  const [showAdd, setShowAdd] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  if (isLoading || !group) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Retour aux groupes
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{group.name}</h2>
          {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
          <p className="text-xs text-muted-foreground mt-1">{group.contacts.length} contact(s)</p>
        </div>
        <div className="flex gap-2">
          {group.contacts.some((c) => !c.consent_status && c.email) && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const toSend = group.contacts.filter((c) => !c.consent_status && c.email && !sentIds.has(c.id));
                for (const c of toSend) {
                  try {
                    await sendConsent.mutateAsync({ contactId: c.id });
                    setSentIds((prev) => new Set(prev).add(c.id));
                  } catch { /* skip failed */ }
                }
              }}
              disabled={sendConsent.isPending}
            >
              <Send className="w-4 h-4" /> Envoyer consentement à tous
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <UserPlus className="w-4 h-4" /> Ajouter
          </Button>
        </div>
      </div>

      {showAdd && <AddContactForm groupId={groupId} onDone={() => setShowAdd(false)} />}

      {group.contacts.length === 0 && !showAdd ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Aucun contact dans ce groupe.
        </div>
      ) : (
        <div className="bg-background rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Nom</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Téléphone</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Rôle</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Consentement</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Enrollment</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {group.contacts.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.role ?? "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1.5">
                      <ConsentBadge status={c.consent_status} type={c.consent_type} />
                      {!c.consent_status && c.email && !sentIds.has(c.id) && (
                        <button
                          onClick={() => {
                            sendConsent.mutate(
                              { contactId: c.id },
                              { onSuccess: () => setSentIds((prev) => new Set(prev).add(c.id)) },
                            );
                          }}
                          disabled={sendConsent.isPending}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Envoyer demande de consentement par email"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {sentIds.has(c.id) && (
                        <span className="text-xs text-green-600">Envoyé</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1">
                      <EnrollmentBadge status={c.enrollment_status} />
                      {c.enrollment_status && c.speaker_profile_id && (
                        <button
                          onClick={() => {
                            if (!confirm(`Réinitialiser l'enrollment de ${c.name} ?`)) return;
                            resetEnrollment.mutate(c.speaker_profile_id!);
                          }}
                          className="text-muted-foreground hover:text-orange-600 transition-colors"
                          title="Réinitialiser l'enrollment"
                          disabled={resetEnrollment.isPending}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteContact.mutate({ groupId, contactId: c.id })}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export function ContactsPage() {
  const { data: groups, isLoading } = useContactGroups();
  const deleteGroup = useDeleteContactGroup();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  if (selectedGroupId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Contacts</h1>
        <p className="text-muted-foreground mb-6">Gérez vos groupes et contacts</p>
        <GroupDetail groupId={selectedGroupId} onBack={() => setSelectedGroupId(null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Contacts</h1>
          <p className="text-muted-foreground">Gérez vos groupes et contacts</p>
        </div>
        {!showCreate && groups && groups.length > 0 && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Nouveau groupe
          </Button>
        )}
      </div>

      {showCreate && <CreateGroupForm onDone={() => setShowCreate(false)} />}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !groups || groups.length === 0 ? (
        <div className="bg-background rounded-xl border border-border p-8">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <BookUser className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Aucun groupe de contacts</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Créez un groupe (résidence, commission, lot…) puis ajoutez-y vos contacts.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Nouveau groupe
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.id}
              className="bg-background rounded-xl border border-border p-5 hover:shadow-sm transition-shadow cursor-pointer group"
              onClick={() => setSelectedGroupId(g.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{g.name}</h3>
                  {g.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.description}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">
                    {g.contact_count} contact{g.contact_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteGroup.mutate(g.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    title="Supprimer le groupe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
