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
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Pencil } from "lucide-react";
import {
  useContactGroups,
  useContactGroup,
  useCreateContactGroup,
  useDeleteContactGroup,
  useUpdateContactGroup,
  useAddContact,
  useAddContactToGroup,
  useRemoveContactFromGroup,
  useUpdateContact,
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
          className="w-full px-2.5 py-1.5 border border-input rounded-md text-sm bg-background"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Prénom"
          autoFocus
        />
      </div>
      <div className="flex-[1.5] min-w-0">
        <input
          className={`w-full px-2.5 py-1.5 border rounded-md text-sm bg-background ${errors.name ? "border-destructive" : "border-input"}`}
          value={name}
          onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
          placeholder="Nom *"
        />
        {errors.name && <p className="text-[11px] text-destructive mt-0.5">{errors.name}</p>}
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

// ── Edit contact row ─────────────────────────────────────────────────────────

function EditContactRow({ contact, groupId, onDone }: { contact: Contact; groupId: string; onDone: () => void }) {
  const update = useUpdateContact();
  const [name, setName] = useState(contact.name);
  const [firstName, setFirstName] = useState(contact.first_name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [role, setRole] = useState(contact.role ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate(
      {
        groupId,
        contactId: contact.id,
        name: name.trim(),
        first_name: firstName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        role: role.trim() || null,
      },
      { onSuccess: () => onDone() },
    );
  }

  return (
    <tr className="border-b border-border bg-accent/30">
      <td className="px-2 py-1.5">
        <input className="w-full px-2 py-1 border border-input rounded text-sm bg-background" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
      </td>
      <td className="px-2 py-1.5">
        <input className="w-full px-2 py-1 border border-input rounded text-sm bg-background" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="px-2 py-1.5 hidden sm:table-cell">
        <input className="w-full px-2 py-1 border border-input rounded text-sm bg-background" value={email} onChange={(e) => setEmail(e.target.value)} />
      </td>
      <td className="px-2 py-1.5 hidden md:table-cell">
        <input className="w-full px-2 py-1 border border-input rounded text-sm bg-background" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </td>
      <td className="px-2 py-1.5 hidden lg:table-cell">
        <input className="w-full px-2 py-1 border border-input rounded text-sm bg-background" value={role} onChange={(e) => setRole(e.target.value)} />
      </td>
      <td className="px-2 py-1.5">
        <ConsentBadge status={contact.consent_status} type={contact.consent_type} />
      </td>
      <td className="px-2 py-1.5 hidden lg:table-cell">
        <EnrollmentBadge status={contact.enrollment_status} />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSubmit} disabled={!name.trim() || update.isPending}>
            {update.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "OK"}
          </Button>
          <button onClick={onDone} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Add existing contact picker ──────────────────────────────────────────────

function AddExistingPicker({ groupId, currentContactIds, onClose }: {
  groupId: string;
  currentContactIds: Set<string>;
  onClose: () => void;
}) {
  const { data: allGroup } = useContactGroup("__all__");
  const addToGroup = useAddContactToGroup();
  const [search, setSearch] = useState("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const available = useMemo(() => {
    if (!allGroup) return [];
    const candidates = allGroup.contacts.filter((c) => !currentContactIds.has(c.id) && !addedIds.has(c.id));
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.first_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [allGroup, currentContactIds, addedIds, search]);

  function handleAdd(contactId: string) {
    addToGroup.mutate({ contactId, groupId }, {
      onSuccess: () => setAddedIds((prev) => new Set(prev).add(contactId)),
    });
  }

  return (
    <div className="border-b border-border bg-accent/30 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Ajouter un contact existant</span>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Rechercher un contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {available.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">
            {!allGroup ? "Chargement..." : "Aucun contact disponible"}
          </p>
        ) : (
          available.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{c.name}</span>
                {c.first_name && <span className="text-muted-foreground"> {c.first_name}</span>}
                {c.email && <span className="text-muted-foreground text-xs ml-2">{c.email}</span>}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs shrink-0"
                onClick={() => handleAdd(c.id)}
                disabled={addToGroup.isPending}
              >
                <Plus className="w-3 h-3 mr-0.5" /> Ajouter
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function GroupDetailPanel({ groupId, allGroups }: { groupId: string; allGroups?: { id: string; name: string }[] }) {
  const isAllView = groupId === "__all__";
  const { data: group, isLoading } = useContactGroup(groupId);
  const deleteContact = useDeleteContact();
  const removeFromGroup = useRemoveContactFromGroup();
  const updateGroup = useUpdateContactGroup();
  const resetEnrollment = useResetEnrollment();
  const sendConsent = useSendConsentRequest();
  const [showAdd, setShowAdd] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
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
          {editingGroupName && !isAllView ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (groupNameDraft.trim() && groupNameDraft.trim() !== group.name) {
                  updateGroup.mutate({ id: groupId, name: groupNameDraft.trim() }, { onSuccess: () => setEditingGroupName(false) });
                } else {
                  setEditingGroupName(false);
                }
              }}
            >
              <input
                autoFocus
                className="text-base font-semibold bg-transparent border border-input rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                value={groupNameDraft}
                onChange={(e) => setGroupNameDraft(e.target.value)}
                onBlur={() => setEditingGroupName(false)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingGroupName(false); }}
              />
            </form>
          ) : (
            <h2
              className={`text-base font-semibold${!isAllView ? " cursor-pointer hover:text-primary" : ""}`}
              onClick={() => { if (!isAllView) { setGroupNameDraft(group.name); setEditingGroupName(true); } }}
            >
              {group.name} {!isAllView && <Pencil className="inline w-3 h-3 text-muted-foreground" />}
            </h2>
          )}
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
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowExisting(true); setShowAdd(false); }}>
                <Plus className="w-3.5 h-3.5" /> Existant
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => { setShowAdd(true); setShowExisting(false); }}>
                <UserPlus className="w-3.5 h-3.5" /> Nouveau
              </Button>
            </>
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

      {/* Add existing contact picker */}
      {showExisting && !isAllView && group && (
        <AddExistingPicker
          groupId={groupId}
          currentContactIds={new Set(group.contacts.map((c) => c.id))}
          onClose={() => setShowExisting(false)}
        />
      )}

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
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">Prénom</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">Nom</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden md:table-cell">Téléphone</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Rôle</th>
                {isAllView && (
                  <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden md:table-cell">Groupes</th>
                )}
                <th className="text-center px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">Consentement</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Enrollment</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                editingId === c.id ? (
                  <EditContactRow
                    key={c.id}
                    contact={c}
                    groupId={isAllView ? (c.group_ids[0] ?? groupId) : groupId}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 group/row">
                  <td className="px-4 py-2.5">{c.first_name ?? ""}</td>
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
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
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {c.consent_status ? (
                        <ConsentBadge status={c.consent_status} type={c.consent_type} />
                      ) : sentIds.has(c.id) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Send className="w-3 h-3" /> Envoyé
                        </span>
                      ) : c.email ? (
                        <button
                          onClick={() => {
                            sendConsent.mutate(
                              { contactId: c.id },
                              { onSuccess: () => setSentIds((prev) => new Set(prev).add(c.id)) },
                            );
                          }}
                          disabled={sendConsent.isPending}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Envoyer demande de consentement"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
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
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100">
                      <button
                        onClick={() => setEditingId(c.id)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {!isAllView && (
                        <button
                          onClick={() => {
                            confirm({
                              title: `Retirer ${c.first_name ?? ""} ${c.name} de ce groupe ?`,
                              description: "Le contact ne sera pas supprimé.",
                              confirmLabel: "Retirer",
                              onConfirm: () => removeFromGroup.mutate({ contactId: c.id, groupId }),
                            });
                          }}
                          className="text-muted-foreground hover:text-orange-500 transition-colors"
                          title="Retirer du groupe"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const targetGroupId = isAllView ? c.group_ids[0] : groupId;
                          if (!targetGroupId) return;
                          confirm({
                            title: `Supprimer définitivement ${c.first_name ?? ""} ${c.name} ?`,
                            description: "Le contact sera supprimé de tous les groupes.",
                            confirmLabel: "Supprimer",
                            onConfirm: () => deleteContact.mutate({ groupId: targetGroupId, contactId: c.id }),
                          });
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Supprimer le contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
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
  const { data: allGroup } = useContactGroup("__all__");
  const deleteGroup = useDeleteContactGroup();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Auto-select "Tous" by default
  const effectiveGroupId = selectedGroupId ?? "__all__";
  const totalContacts = allGroup?.contact_count ?? 0;

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

            {/* Default group */}
            {groups!.filter((g) => g.is_default).map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  effectiveGroupId === g.id
                    ? "bg-accent border border-accent-foreground/10"
                    : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <span className="text-sm font-semibold truncate">{g.name}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {g.contact_count}
                </span>
              </div>
            ))}

            <div className="border-t border-border my-1" />

            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2">
              Groupes
            </div>

            {groups!.filter((g) => !g.is_default).map((g) => (
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
