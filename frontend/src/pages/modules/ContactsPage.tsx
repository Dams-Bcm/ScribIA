import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  UserPlus,
  Loader2,
  ShieldCheck,
  ShieldX,
  Send,
  Mic,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
import type { ContactGroupCreate, ContactCreate, Contact } from "@/api/types";

// ── Badges ───────────────────────────────────────────────────────────────────

function ConsentBadge({ status, type }: { status: string | null; type: string | null }) {
  if (!status) return null;
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
  if (!status) return null;
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

// ── Inline add row ───────────────────────────────────────────────────────────

function InlineAddRow({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const add = useAddContact();
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  function validate() {
    const errs: { name?: string; email?: string } = {};
    if (!name.trim()) {
      errs.name = "Le nom est requis";
    } else if (name.trim().length < 2) {
      errs.name = "Min. 2 caractères";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Email invalide";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const body: ContactCreate & { groupId: string } = {
      groupId,
      name,
      first_name: firstName || null,
      email: email || null,
      phone: phone || null,
      role: role || null,
    };
    add.mutate(body, { onSuccess: () => { setName(""); setFirstName(""); setEmail(""); setPhone(""); setRole(""); setErrors({}); } });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 px-4 py-3 bg-accent/30 border-b border-border">
      <div className="flex-[1.5] min-w-0">
        <input
          className={`w-full px-2.5 py-1.5 border rounded-md text-sm bg-background ${errors.name ? "border-destructive" : "border-input"}`}
          value={name}
          onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
          placeholder="Nom *"
          autoFocus
        />
        {errors.name && <p className="text-[11px] text-destructive mt-0.5">{errors.name}</p>}
      </div>
      <div className="flex-[1.5] min-w-0">
        <input
          className="w-full px-2.5 py-1.5 border border-input rounded-md text-sm bg-background"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Prénom"
        />
      </div>
      <div className="flex-[2] min-w-0">
        <input
          className={`w-full px-2.5 py-1.5 border rounded-md text-sm bg-background ${errors.email ? "border-destructive" : "border-input"}`}
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
          placeholder="Email"
        />
        {errors.email && <p className="text-[11px] text-destructive mt-0.5">{errors.email}</p>}
      </div>
      <input
        className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md text-sm bg-background hidden md:block"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Téléphone"
      />
      <input
        className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md text-sm bg-background hidden lg:block"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Rôle"
      />
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        <Button type="submit" size="sm" disabled={add.isPending} className="h-7 px-3 text-xs">
          {add.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Ajouter"}
        </Button>
        <button type="button" onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

// ── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ contacts }: { contacts: Contact[] }) {
  const total = contacts.length;
  const consented = contacts.filter((c) => c.consent_status === "accepted").length;
  const enrolled = contacts.filter((c) => c.enrollment_status === "enrolled").length;
  const refused = contacts.filter((c) => c.consent_status === "declined" || c.consent_status === "withdrawn").length;

  return (
    <div className="flex gap-5 px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
      <span><strong className="text-foreground">{total}</strong> contact{total !== 1 ? "s" : ""}</span>
      {consented > 0 && <span><strong className="text-foreground">{consented}</strong> consentement{consented !== 1 ? "s" : ""}</span>}
      {enrolled > 0 && <span><strong className="text-foreground">{enrolled}</strong> enrollé{enrolled !== 1 ? "s" : ""}</span>}
      {refused > 0 && <span className="text-destructive"><strong>{refused}</strong> refusé{refused !== 1 ? "s" : ""}</span>}
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function GroupDetailPanel({ groupId, allGroups }: { groupId: string; allGroups?: { id: string; name: string }[] }) {
  const isAllView = groupId === "__all__";
  const { data: group, isLoading } = useContactGroup(groupId);
  const deleteContact = useDeleteContact();
  const resetEnrollment = useResetEnrollment();
  const sendConsent = useSendConsentRequest();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Map group ids to names for display in "Tous" view
  const groupNameMap = useMemo(() => {
    if (!allGroups) return {};
    return Object.fromEntries(allGroups.map((g) => [g.id, g.name]));
  }, [allGroups]);

  const filtered = useMemo(() => {
    if (!group) return [];
    if (!search.trim()) return group.contacts;
    const q = search.toLowerCase();
    return group.contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.first_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.role?.toLowerCase().includes(q),
    );
  }, [group, search]);

  if (isLoading || !group) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const consented = group.contacts.filter((c) => c.consent_status === "accepted").length;
  const enrolled = group.contacts.filter((c) => c.enrollment_status === "enrolled").length;

  return (
    <div className="bg-background rounded-xl border border-border overflow-hidden flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h2 className="text-base font-semibold">{group.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {group.contacts.length} contact{group.contacts.length !== 1 ? "s" : ""}
            {consented > 0 && <> &middot; {consented} consentement{consented !== 1 ? "s" : ""}</>}
            {enrolled > 0 && <> &middot; {enrolled} enrollé{enrolled !== 1 ? "s" : ""}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAllView && group.contacts.some((c) => !c.consent_status && c.email) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
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
              <Send className="w-3.5 h-3.5" /> Consentement
            </Button>
          )}
          {!isAllView && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowAdd(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Ajouter
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Rechercher un contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Inline add */}
      {showAdd && !isAllView && <InlineAddRow groupId={groupId} onClose={() => setShowAdd(false)} />}

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {group.contacts.length === 0 && !showAdd ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Aucun contact dans ce groupe.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 sticky top-0 z-[1]">
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">Nom</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">Prénom</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden md:table-cell">Téléphone</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Rôle</th>
                {isAllView && (
                  <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden md:table-cell">Groupes</th>
                )}
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">Consentement</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Enrollment</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 group/row">
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5">{c.first_name ?? ""}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{c.email ?? ""}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{c.phone ?? ""}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{c.role ?? ""}</td>
                  {isAllView && (
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {c.group_ids.map((gid) => (
                          <span key={gid} className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-muted text-muted-foreground">
                            {groupNameMap[gid] ?? gid}
                          </span>
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2.5">
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
                          className="text-blue-600 hover:text-blue-800 transition-colors opacity-0 group-hover/row:opacity-100"
                          title="Envoyer demande de consentement"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {sentIds.has(c.id) && (
                        <span className="text-xs text-green-600">Envoyé</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    <div className="flex items-center gap-1">
                      <EnrollmentBadge status={c.enrollment_status} />
                      {c.enrollment_status && c.speaker_profile_id && (
                        <button
                          onClick={() => {
                            confirm({
                              title: `Réinitialiser l'enrollment de ${c.name} ?`,
                              confirmLabel: "Réinitialiser",
                              onConfirm: () => resetEnrollment.mutate(c.speaker_profile_id!),
                            });
                          }}
                          className="text-muted-foreground hover:text-orange-600 transition-colors opacity-0 group-hover/row:opacity-100"
                          title="Réinitialiser l'enrollment"
                          disabled={resetEnrollment.isPending}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {!isAllView && (
                      <button
                        onClick={() => deleteContact.mutate({ groupId, contactId: c.id })}
                        className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover/row:opacity-100"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && search && (
                <tr>
                  <td colSpan={isAllView ? 9 : 8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Aucun contact trouvé pour « {search} »
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats */}
      {group.contacts.length > 0 && <StatsBar contacts={group.contacts} />}
      {confirmDialog}
    </div>
  );
}

// ── Sidebar: create group form ───────────────────────────────────────────────

function SidebarCreateForm({ onDone, onCreated }: { onDone: () => void; onCreated?: (id: string) => void }) {
  const create = useCreateContactGroup();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: ContactGroupCreate = { name, description: description || null };
    create.mutate(body, { onSuccess: (group) => { onCreated?.(group.id); onDone(); } });
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-2 border border-border rounded-lg bg-accent/30">
      <input
        className="w-full px-2.5 py-1.5 border border-input rounded-md text-sm bg-background"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du groupe *"
        autoFocus
        required
      />
      <input
        className="w-full px-2.5 py-1.5 border border-input rounded-md text-sm bg-background"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optionnel)"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim() || create.isPending} size="sm" className="h-7 text-xs">
          {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Créer"}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function ContactsPage() {
  const { data: groups, isLoading } = useContactGroups();
  const deleteGroup = useDeleteContactGroup();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Auto-select "Tous" by default
  const effectiveGroupId = selectedGroupId ?? "__all__";
  const totalContacts = groups?.reduce((sum, g) => sum + g.contact_count, 0) ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="text-sm text-muted-foreground">Gérez vos groupes et contacts</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-4" style={{ minHeight: "500px" }}>
          {/* ── Sidebar ─────────────────────────────── */}
          <div className="bg-background rounded-xl border border-border p-3 flex flex-col gap-1 overflow-y-auto">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2">
              Groupes
            </div>

            {/* Virtual "Tous" group */}
            <div
              onClick={() => setSelectedGroupId("__all__")}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                effectiveGroupId === "__all__"
                  ? "bg-accent border border-accent-foreground/10"
                  : "hover:bg-muted/50 border border-transparent"
              }`}
            >
              <span className="text-sm font-semibold truncate">Tous</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {totalContacts}
              </span>
            </div>

            <div className="border-t border-border my-1" />

            {groups!.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item ${
                  effectiveGroupId === g.id
                    ? "bg-accent border border-accent-foreground/10"
                    : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <span className="text-sm font-medium truncate">{g.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {g.contact_count}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      confirm({
                        title: `Supprimer le groupe "${g.name}" ?`,
                        confirmLabel: "Supprimer",
                        onConfirm: () => deleteGroup.mutate(g.id),
                      });
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover/item:opacity-100 p-0.5"
                    title="Supprimer le groupe"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* New group button / form */}
            {showCreate ? (
              <SidebarCreateForm onDone={() => setShowCreate(false)} onCreated={(id) => setSelectedGroupId(id)} />
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center justify-center gap-1.5 mt-1 px-3 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Nouveau groupe
              </button>
            )}
          </div>

          {/* ── Detail ──────────────────────────────── */}
          {effectiveGroupId ? (
            <GroupDetailPanel groupId={effectiveGroupId} allGroups={groups} />
          ) : (
            <div className="bg-background rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground">
              Sélectionnez un groupe
            </div>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
