import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  CalendarClock,
  Plus,
  Trash2,
  X,
  MapPin,
  Users,
  Mic,
  Upload,
  Search,
  ChevronLeft,
  ShieldCheck,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  usePlannedMeetings,
  usePlannedMeeting,
  useCreatePlannedMeeting,
  useDeletePlannedMeeting,
  useAddParticipants,
  useRemoveParticipant,
  useUpdatePlannedMeeting,
} from "@/api/hooks/usePlannedMeetings";
import { useContactGroups, useContactGroup } from "@/api/hooks/useContacts";
import { useDossier } from "@/api/hooks/usePreparatoryPhases";
import { AgendaEditor } from "@/components/preparatory/AgendaEditor";
import { DocumentUpload } from "@/components/preparatory/DocumentUpload";
import type { PlannedMeeting, PlannedMeetingParticipant, Contact } from "@/api/types";

// ── Status helpers ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  planned: { label: "Planifiée", className: "bg-blue-50 text-blue-700", icon: Clock },
  in_progress: { label: "En cours", className: "bg-amber-50 text-amber-700", icon: Play },
  completed: { label: "Terminée", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Annulée", className: "bg-gray-100 text-gray-600", icon: XCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const config = (STATUS_CONFIG[status] ?? STATUS_CONFIG.planned)!;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main page ───────────────────────────────────────────────────────────────

export function PlannedMeetingsPage() {
  const { data: meetings = [], isLoading } = usePlannedMeetings();
  const deleteMeeting = useDeletePlannedMeeting();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");

  const filtered = useMemo(() => {
    let list = meetings;
    if (statusFilter !== "__all__") list = list.filter((m) => m.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.title.toLowerCase().includes(q) || m.location?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [meetings, statusFilter, search]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: meetings.length,
      today: meetings.filter((m) => new Date(m.meeting_date).toDateString() === today).length,
      upcoming: meetings.filter((m) => m.status === "planned").length,
    };
  }, [meetings]);

  function handleDelete(m: PlannedMeeting) {
    confirm({
      title: `Supprimer "${m.title}" ?`,
      description: "Cette action est irréversible.",
      confirmLabel: "Supprimer",
      onConfirm: () => deleteMeeting.mutate(m.id),
    });
  }

  // ── Detail view ─────────────────────────────────────────────────────────
  if (selectedId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Réunions planifiées</h1>
        <p className="text-muted-foreground mb-6">Planifiez vos réunions avec identification automatique des intervenants</p>
        <MeetingDetail meetingId={selectedId} onBack={() => setSelectedId(null)} />
        {confirmDialog}
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Réunions planifiées</h1>
          <p className="text-sm text-muted-foreground">
            Planifiez vos réunions avec identification automatique des intervenants
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Planifier une réunion
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-background rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-background rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Aujourd'hui</p>
          <p className="text-2xl font-bold">{stats.today}</p>
        </div>
        <div className="bg-background rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">A venir</p>
          <p className="text-2xl font-bold text-primary">{stats.upcoming}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous les statuts</SelectItem>
            <SelectItem value="planned">Planifiée</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="completed">Terminée</SelectItem>
            <SelectItem value="cancelled">Annulée</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm bg-background w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-background rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <CalendarClock className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Aucune réunion planifiée</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Planifiez une réunion pour pré-sélectionner les participants et activer l'identification automatique des intervenants
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Planifier une réunion
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium">Réunion</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Lieu</th>
                <th className="text-center px-4 py-2.5 font-medium">Participants</th>
                <th className="text-center px-4 py-2.5 font-medium">Consentements</th>
                <th className="text-center px-4 py-2.5 font-medium">Statut</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelectedId(m.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.title}</p>
                    {m.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{m.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(m.meeting_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.location ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {m.location}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      {m.participant_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.consented_count === m.participant_count && m.participant_count > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {m.consented_count}/{m.participant_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(m); }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDialog}
      {showCreate && <CreateMeetingModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Create Meeting Modal ────────────────────────────────────────────────────

export function CreateMeetingModal({ onClose }: { onClose: () => void }) {
  const createMeeting = useCreatePlannedMeeting();
  const { data: groups = [] } = useContactGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const { data: groupDetail } = useContactGroup(selectedGroupId);

  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    meeting_date: "",
    meeting_time: "",
  });
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  const contacts: Contact[] = groupDetail?.contacts ?? [];

  // Auto-select all contacts when a group is loaded
  useEffect(() => {
    if (groupDetail?.contacts) {
      setSelectedContactIds(new Set(groupDetail.contacts.map((c) => c.id)));
    }
  }, [groupDetail]);

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (contacts.length === selectedContactIds.size) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(contacts.map((c) => c.id)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateStr = form.meeting_date && form.meeting_time
      ? `${form.meeting_date}T${form.meeting_time}:00`
      : form.meeting_date
        ? `${form.meeting_date}T09:00:00`
        : "";
    if (!dateStr) return;

    await createMeeting.mutateAsync({
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      meeting_date: dateStr,
      participant_ids: [...selectedContactIds],
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl border border-border p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Planifier une réunion</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Titre</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Conseil municipal du 15 mars"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Date</label>
              <input
                type="date"
                required
                value={form.meeting_date}
                onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Heure</label>
              <input
                type="time"
                value={form.meeting_time}
                onChange={(e) => setForm({ ...form, meeting_time: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Lieu</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Salle du conseil"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Description <span className="text-muted-foreground font-normal">(utilisée par les documents IA)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Décrivez le sujet et le contexte de la réunion. Plus c'est précis, meilleur sera le document IA généré."
            />
          </div>

          {/* Participant selection */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Participants</label>
            <Select
              value={selectedGroupId ?? ""}
              onValueChange={(v) => {
                setSelectedGroupId(v === "__none__" ? null : v);
                setSelectedContactIds(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="-- Sélectionner un groupe de contacts --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">-- Sélectionner un groupe --</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({g.contact_count} contacts)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {contacts.length > 0 && (
              <div className="mt-3 border border-border rounded-lg max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {selectedContactIds.size === contacts.length ? "Tout désélectionner" : "Tout sélectionner"}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {selectedContactIds.size} sélectionné(s)
                  </span>
                </div>
                {contacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 cursor-pointer border-b border-border last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContactIds.has(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {c.first_name ? `${c.first_name} ${c.name}` : c.name}
                      </p>
                      {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                    </div>
                    {c.enrollment_status === "enrolled" ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600" title="Profil vocal enrollé">
                        <Mic className="w-3 h-3" /> Enrollé
                      </span>
                    ) : c.speaker_profile_id ? (
                      <span className="flex items-center gap-1 text-xs text-amber-600" title="Profil vocal en attente">
                        <Mic className="w-3 h-3" /> En attente
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pas de profil</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={!form.title || !form.meeting_date || createMeeting.isPending}
            className="w-full"
          >
            {createMeeting.isPending ? "Création..." : "Planifier la réunion"}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Meeting Detail View ─────────────────────────────────────────────────────

export function MeetingDetail({ meetingId, onBack }: { meetingId: string; onBack: () => void }) {
  const { data: meeting, isLoading } = usePlannedMeeting(meetingId);
  const updateMeeting = useUpdatePlannedMeeting();
  const removeParticipant = useRemoveParticipant();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const navigate = useNavigate();

  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const { data: dossier } = useDossier(meeting?.dossier_id ?? null);

  if (isLoading || !meeting) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  function handleRemoveParticipant(p: PlannedMeetingParticipant) {
    confirm({
      title: `Retirer ${p.name} ?`,
      confirmLabel: "Retirer",
      onConfirm: () => removeParticipant.mutate({ meetingId, participantId: p.id }),
    });
  }

  function handleStartRecording() {
    // Navigate to the reunions page where user can upload/record
    // The meeting context will be available via query param
    navigate(`/reunions?planned_meeting_id=${meetingId}`);
  }

  function handleComplete() {
    updateMeeting.mutate({ id: meetingId, data: { status: "completed" } });
  }

  function handleCancel() {
    confirm({
      title: "Annuler cette réunion ?",
      confirmLabel: "Annuler la réunion",
      onConfirm: () => updateMeeting.mutate({ id: meetingId, data: { status: "cancelled" } }),
    });
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft className="w-4 h-4" /> Retour à la liste
      </button>

      {/* Header */}
      <div className="bg-background rounded-xl border border-border p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold mb-1">{meeting.title}</h2>
            {meeting.description && (
              <p className="text-sm text-muted-foreground mb-3">{meeting.description}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarClock className="w-4 h-4" /> {formatDateTime(meeting.meeting_date)}
              </span>
              {meeting.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> {meeting.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={meeting.status} />
            {meeting.status === "planned" && (
              <>
                <Button size="sm" variant="outline" onClick={() => navigate(`/reunions?planned_meeting_id=${meetingId}`)}>
                  <Upload className="w-4 h-4 mr-1" /> Importer un audio
                </Button>
                <Button size="sm" onClick={handleStartRecording}>
                  <Mic className="w-4 h-4 mr-1" /> Enregistrer
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  Annuler
                </Button>
              </>
            )}
            {meeting.status === "in_progress" && (
              <Button size="sm" variant="outline" onClick={handleComplete}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Terminer
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="bg-background rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Participants ({meeting.participants.length})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {meeting.consented_count}/{meeting.participant_count} consentements
            </span>
            {meeting.status === "planned" && (
              <Button size="sm" variant="outline" onClick={() => setShowAddParticipants(true)}>
                <Plus className="w-3 h-3 mr-1" /> Ajouter
              </Button>
            )}
          </div>
        </div>

        {meeting.participants.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucun participant</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {meeting.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  p.consent_status === "accepted" ? "bg-emerald-500" : "bg-gray-400"
                }`}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.name}</p>
                  {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {p.consent_status === "accepted" ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <ShieldCheck className="w-3.5 h-3.5" /> Consentement OK
                    </span>
                  ) : p.consent_status === "declined" ? (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <UserX className="w-3.5 h-3.5" /> Refusé
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserX className="w-3.5 h-3.5" /> En attente
                    </span>
                  )}
                  {meeting.status === "planned" && (
                    <button
                      onClick={() => handleRemoveParticipant(p)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Préparation — Agenda + Documents */}
      {dossier && (
        <div className="mt-4 space-y-4">
          <div className="bg-background rounded-xl border border-border p-5">
            <AgendaEditor dossierId={dossier.id} points={dossier.agenda_points} />
          </div>
          <div className="bg-background rounded-xl border border-border p-5">
            <DocumentUpload dossierId={dossier.id} documents={dossier.documents} label="Documents préparatoires" />
          </div>
        </div>
      )}

      {/* Link to diarisation job if exists */}
      {meeting.job_id && (
        <div className="mt-4 bg-background rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground mb-2">Enregistrement lié</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/reunions?job=${meeting.job_id}`)}
          >
            Voir la transcription
          </Button>
        </div>
      )}

      {confirmDialog}
      {showAddParticipants && (
        <AddParticipantsModal
          meetingId={meetingId}
          existingContactIds={new Set(meeting.participants.map((p) => p.contact_id).filter(Boolean) as string[])}
          onClose={() => setShowAddParticipants(false)}
        />
      )}
    </div>
  );
}

// ── Add Participants Modal ──────────────────────────────────────────────────

export function AddParticipantsModal({
  meetingId,
  existingContactIds,
  onClose,
}: {
  meetingId: string;
  existingContactIds: Set<string>;
  onClose: () => void;
}) {
  const { data: groups = [] } = useContactGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const { data: groupDetail } = useContactGroup(selectedGroupId);
  const addParticipants = useAddParticipants();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const contacts = (groupDetail?.contacts ?? []).filter((c) => !existingContactIds.has(c.id));

  // Auto-select all contacts when a group is loaded
  useEffect(() => {
    if (groupDetail?.contacts) {
      setSelectedIds(new Set(
        groupDetail.contacts.filter((c) => !existingContactIds.has(c.id)).map((c) => c.id),
      ));
    }
  }, [groupDetail, existingContactIds]);

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selectedIds.size === 0) return;
    await addParticipants.mutateAsync({ meetingId, contactIds: [...selectedIds] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl border border-border p-6 w-full max-w-md shadow-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Ajouter des participants</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="space-y-4">
          <Select
            value={selectedGroupId ?? ""}
            onValueChange={(v) => {
              setSelectedGroupId(v === "__none__" ? null : v);
              setSelectedIds(new Set());
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="-- Groupe de contacts --" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- Groupe de contacts --</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {contacts.length > 0 && (
            <div className="border border-border rounded-lg max-h-60 overflow-y-auto">
              {contacts.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 cursor-pointer border-b border-border last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleContact(c.id)}
                    className="rounded"
                  />
                  <span className="text-sm">
                    {c.first_name ? `${c.first_name} ${c.name}` : c.name}
                  </span>
                  {c.enrollment_status === "enrolled" && (
                    <Mic className="w-3 h-3 text-emerald-600 ml-auto" />
                  )}
                </label>
              ))}
            </div>
          )}

          {contacts.length === 0 && selectedGroupId && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Tous les contacts de ce groupe sont déjà participants
            </p>
          )}

          <Button
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || addParticipants.isPending}
            className="w-full"
          >
            {addParticipants.isPending ? "Ajout..." : `Ajouter ${selectedIds.size} participant(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
