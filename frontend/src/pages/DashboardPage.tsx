import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../stores/auth";
import { ModuleGuard } from "../components/ModuleGuard";
import { useDiarisationJobs } from "../api/hooks/useDiarisation";
import { usePlannedMeetings } from "../api/hooks/usePlannedMeetings";
import { useAIDocuments } from "../api/hooks/useAIDocuments";
import type { DiarisationJob } from "../api/types";
import {
  CalendarDays,
  Mic,
  Sparkles,
  FileText,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  ChevronRight,
  Loader2,
  LayoutDashboard,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}min`;
  return `${m}min`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "A l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  return `il y a ${days}j`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTIVE_STATUSES = new Set([
  "uploading", "queued", "converting", "diarizing", "transcribing", "aligning", "consent_check",
]);

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-background rounded-xl border border-border p-5 flex items-center gap-4 hover:border-primary/25 transition-colors">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground font-medium mb-0.5">{label}</div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: React.ElementType;
  title: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="w-4 h-4 text-muted-foreground" />
        {title}
      </div>
      {right}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: jobs = [] } = useDiarisationJobs();
  const { data: meetings = [] } = usePlannedMeetings();
  const { data: docs = [] } = useAIDocuments();

  // ── Computed data ────────────────────────────────────────────────────────

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const jobsThisMonth = useMemo(
    () => jobs.filter((j) => new Date(j.created_at) >= monthStart),
    [jobs, monthStart],
  );

  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status === "completed"),
    [jobs],
  );

  const totalHoursSeconds = useMemo(
    () => completedJobs.reduce((acc, j) => acc + (j.duration_seconds || 0), 0),
    [completedJobs],
  );

  const docsThisMonth = useMemo(
    () => docs.filter((d) => new Date(d.created_at) >= monthStart),
    [docs, monthStart],
  );

  // Reunions transcrites sans document genere
  const jobsWithDoc = new Set(docs.filter((d) => d.source_session_id).map((d) => d.source_session_id));
  const jobsWithoutDoc = useMemo(
    () => completedJobs.filter((j) => !jobsWithDoc.has(j.id)),
    [completedJobs, jobsWithDoc],
  );

  // Jobs en cours de traitement (sans document possible encore)
  const activeJobs = useMemo(
    () => jobs.filter((j) => ACTIVE_STATUSES.has(j.status)),
    [jobs],
  );

  // Prochaines reunions planifiees (futures, triees par date)
  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter((m) => m.status === "planned" && new Date(m.meeting_date) >= now)
        .sort((a, b) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime())
        .slice(0, 3),
    [meetings, now],
  );

  // Activite recente (jobs + docs combines, tries par date)
  const recentActivity = useMemo(() => {
    const items: {
      id: string;
      type: "doc_completed" | "doc_error" | "doc_generating" | "transcription_done" | "transcription_active" | "transcription_error";
      title: string;
      label: string;
      date: string;
    }[] = [];

    for (const d of docs.slice(0, 10)) {
      if (d.status === "completed") {
        items.push({ id: d.id, type: "doc_completed", title: d.title, label: "Document genere", date: d.generation_completed_at || d.created_at });
      } else if (d.status === "error") {
        items.push({ id: d.id, type: "doc_error", title: d.title, label: "Erreur de generation", date: d.created_at });
      } else if (d.status === "generating" || d.status === "pending") {
        items.push({ id: d.id, type: "doc_generating", title: d.title, label: "Generation en cours", date: d.created_at });
      }
    }

    for (const j of jobs.slice(0, 10)) {
      if (j.status === "completed") {
        items.push({ id: j.id, type: "transcription_done", title: j.title, label: "Transcription terminee", date: j.updated_at });
      } else if (j.status === "error") {
        items.push({ id: j.id, type: "transcription_error", title: j.title, label: "Erreur de transcription", date: j.updated_at });
      } else if (ACTIVE_STATUSES.has(j.status)) {
        items.push({ id: j.id, type: "transcription_active", title: j.title, label: "Transcription en cours", date: j.updated_at });
      }
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  }, [jobs, docs]);

  // Derniers documents
  const recentDocs = useMemo(
    () => [...docs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4),
    [docs],
  );

  // Reunions a traiter = transcrites sans doc + en cours
  const toProcess = useMemo(() => {
    const items: (DiarisationJob & { _processable: boolean })[] = [];
    for (const j of jobsWithoutDoc) {
      items.push({ ...j, _processable: true });
    }
    for (const j of activeJobs) {
      if (!items.find((i) => i.id === j.id)) {
        items.push({ ...j, _processable: false });
      }
    }
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3);
  }, [jobsWithoutDoc, activeJobs]);

  // ── Activity icon/color helpers ──────────────────────────────────────────

  function activityStyle(type: string) {
    switch (type) {
      case "doc_completed":
        return { bg: "bg-green-500/10", text: "text-green-500", Icon: Sparkles };
      case "transcription_done":
        return { bg: "bg-cyan-500/10", text: "text-cyan-500", Icon: CheckCircle2 };
      case "transcription_active":
      case "doc_generating":
        return { bg: "bg-amber-500/10", text: "text-amber-500", Icon: Loader2 };
      case "transcription_error":
      case "doc_error":
        return { bg: "bg-red-500/10", text: "text-red-500", Icon: AlertCircle };
      default:
        return { bg: "bg-muted/10", text: "text-muted-foreground", Icon: Clock };
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            Tableau de bord
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bienvenue, {user?.display_name ?? user?.username}
          </p>
        </div>
        <div className="flex gap-2">
          <ModuleGuard module="ai_documents">
            <Link to="/reunions" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/50 transition-colors">
              <Sparkles className="w-3.5 h-3.5" />
              Generer un document
            </Link>
          </ModuleGuard>
          <ModuleGuard module="transcription_diarisation">
            <Link to="/reunions" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Nouvelle reunion
            </Link>
          </ModuleGuard>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          icon={CalendarDays}
          label="Reunions ce mois"
          value={jobsThisMonth.length}
          sub={<>{completedJobs.length} traitees au total</>}
          color="bg-blue-500/10 text-blue-500"
        />
        <KpiCard
          icon={Mic}
          label="Heures transcrites"
          value={formatDuration(totalHoursSeconds)}
          sub={<>{completedJobs.length} reunions traitees</>}
          color="bg-emerald-500/10 text-emerald-500"
        />
        <KpiCard
          icon={FileText}
          label="Documents generes"
          value={docsThisMonth.length}
          sub={<>{docs.filter((d) => d.status === "completed").length} au total</>}
          color="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={Sparkles}
          label="A traiter"
          value={jobsWithoutDoc.length + activeJobs.length}
          sub={
            <>
              {jobsWithoutDoc.length > 0 && (
                <span className="text-amber-500">{jobsWithoutDoc.length} sans document</span>
              )}
              {jobsWithoutDoc.length > 0 && activeJobs.length > 0 && " · "}
              {activeJobs.length > 0 && `${activeJobs.length} en cours`}
              {jobsWithoutDoc.length === 0 && activeJobs.length === 0 && "Tout est a jour"}
            </>
          }
          color="bg-amber-500/10 text-amber-500"
        />
      </div>

      {/* Ligne 2 — Prochaines reunions + Activite recente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Prochaines reunions */}
        <div className="bg-background rounded-xl border border-border overflow-hidden">
          <SectionHeader
            icon={CalendarDays}
            title="Prochaines reunions"
            right={
              <Link to="/reunions" className="text-xs text-primary font-medium hover:underline">
                Voir tout &rarr;
              </Link>
            }
          />

          {upcomingMeetings.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune reunion planifiee
            </div>
          ) : (
            upcomingMeetings.map((m) => {
              const d = new Date(m.meeting_date);
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3.5 px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/reunions?meeting=${m.id}`)}
                >
                  <div className="w-11 h-11 rounded-[10px] bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-base font-bold text-blue-500 leading-none">{d.getDate()}</span>
                    <span className="text-[9px] font-semibold text-blue-500 uppercase leading-none mt-px">
                      {d.toLocaleDateString("fr-FR", { month: "short" })}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{m.title}</div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      <span>{formatTime(m.meeting_date)}</span>
                      {m.location && <span>{m.location}</span>}
                      <span>{m.participant_count} participants</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {d.getTime() - now.getTime() < 24 * 3600 * 1000 ? (
                      <button
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium"
                        onClick={(e) => { e.stopPropagation(); navigate(`/reunions?meeting=${m.id}`); }}
                      >
                        <Play className="w-3 h-3" /> Demarrer
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[11px] font-semibold border border-blue-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> Planifiee
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div className="px-5 py-3 border-t border-border text-center">
            <Link to="/reunions" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 transition-colors">
              <Plus className="w-3 h-3" /> Planifier une reunion
            </Link>
          </div>
        </div>

        {/* Activite recente */}
        <div className="bg-background rounded-xl border border-border overflow-hidden">
          <SectionHeader
            icon={Clock}
            title="Activite recente"
            right={
              <Link to="/reunions" className="text-xs text-primary font-medium hover:underline">
                Voir tout &rarr;
              </Link>
            }
          />

          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune activite recente
            </div>
          ) : (
            <div className="px-5 py-4">
              {recentActivity.map((item, i) => {
                const style = activityStyle(item.type);
                return (
                  <div key={item.id + item.type} className="flex gap-3.5 relative pb-5 last:pb-0">
                    {/* Vertical line */}
                    {i < recentActivity.length - 1 && (
                      <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border" />
                    )}
                    <div className={`w-8 h-8 rounded-full ${style.bg} ${style.text} flex items-center justify-center flex-shrink-0 relative z-10`}>
                      <style.Icon className={`w-3.5 h-3.5 ${item.type.includes("active") || item.type.includes("generating") ? "animate-spin" : ""}`} />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className={`text-xs font-semibold ${style.text}`}>{item.label}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{item.title}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground pt-1.5 flex-shrink-0">
                      {timeAgo(item.date)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Ligne 3 — Documents recents + Reunions a traiter */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Derniers documents */}
        <ModuleGuard module="ai_documents">
          <div className="bg-background rounded-xl border border-border overflow-hidden">
            <SectionHeader
              icon={FileText}
              title={
                <span className="flex items-center gap-2">
                  Derniers documents
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                    <Sparkles className="w-2.5 h-2.5" /> IA
                  </span>
                </span>
              }
              right={
                <Link to="/reunions" className="text-xs text-primary font-medium hover:underline">
                  Voir tout &rarr;
                </Link>
              }
            />

            {recentDocs.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun document genere
              </div>
            ) : (
              recentDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors">
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                    d.status === "completed" ? "bg-green-500/10 text-green-500" :
                    d.status === "error" ? "bg-red-500/10 text-red-500" :
                    "bg-amber-500/10 text-amber-500"
                  }`}>
                    {d.status === "completed" ? <FileText className="w-4 h-4" /> :
                     d.status === "error" ? <AlertCircle className="w-4 h-4" /> :
                     <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{d.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {d.status === "error" ? "Erreur de generation" :
                       d.status === "completed" ? formatDate(d.generation_completed_at || d.created_at) :
                       "Generation en cours..."}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      d.status === "completed" ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                      d.status === "error" ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                      "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    }`}>
                      {d.status === "completed" ? "Termine" : d.status === "error" ? "Erreur" : "En cours"}
                    </span>
                    {d.status === "completed" && (
                      <button className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Exporter">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {d.status === "error" && (
                      <button className="p-1 text-amber-500 hover:text-amber-400 transition-colors" title="Relancer">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ModuleGuard>

        {/* Reunions a traiter */}
        <ModuleGuard module="transcription_diarisation">
          <div className="bg-background rounded-xl border border-border overflow-hidden">
            <SectionHeader
              icon={Sparkles}
              title="Reunions a traiter"
              right={
                toProcess.length > 0 ? (
                  <span className="text-[11px] text-amber-500 font-semibold">
                    {jobsWithoutDoc.length} sans document
                  </span>
                ) : null
              }
            />

            {toProcess.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Toutes les reunions ont un document
              </div>
            ) : (
              toProcess.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/reunions?job=${j.id}`)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                      j._processable ? "bg-cyan-500/10 text-cyan-500" : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {j._processable ? <CheckCircle2 className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{j.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDate(j.created_at)} &middot; {formatDuration(j.duration_seconds)}
                        {j.detected_speakers ? ` \u00b7 ${j.detected_speakers} intervenants` : ""}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {j._processable ? (
                          <>
                            <span className="inline-flex items-center px-2 py-px rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                              Transcrite
                            </span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="inline-flex items-center px-2 py-px rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border border-dashed">
                              Document ?
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center px-2 py-px rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              Transcription...
                            </span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="inline-flex items-center px-2 py-px rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border border-dashed">
                              Document
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium flex-shrink-0 ${
                      j._processable
                        ? "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                        : "opacity-40 pointer-events-none bg-muted text-muted-foreground border border-border"
                    } transition-colors`}
                    disabled={!j._processable}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/reunions?job=${j.id}`);
                    }}
                  >
                    <Sparkles className="w-3 h-3" /> Generer
                  </button>
                </div>
              ))
            )}

            <div className="px-5 py-3 border-t border-border text-center">
              <Link to="/reunions" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 transition-colors">
                Voir toutes les reunions &rarr;
              </Link>
            </div>
          </div>
        </ModuleGuard>
      </div>
    </div>
  );
}
