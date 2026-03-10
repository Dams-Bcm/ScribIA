import { Outlet, NavLink } from "react-router";
import { useAuth } from "../stores/auth";
import {
  LayoutDashboard,
  Building2,
  Users,
  LogOut,
  Menu,
  X,
  Mic,
  CalendarClock,
  Sparkles,
  Shield,
  Lock,
  ClipboardList,
  BookUser,
  FolderCog,
  Search,
  BookOpen,
  Megaphone,
  Mail,
  Moon,
  Sun,
  Bell,
  BellOff,
  KeyRound,
  Loader2,
  Settings,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useChangePassword } from "@/api/hooks/useAuth";
import { cn } from "../lib/utils";
import { AnnouncementPopup } from "./AnnouncementPopup";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  visible: boolean;
  section?: string;
}

export function Layout() {
  const { user, isSuperAdmin, hasModule, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const push = usePushNotifications();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  const THEMES = [
    { key: "light", label: "Clair", icon: Sun },
    { key: "blur", label: "Sombre", icon: Moon },
  ] as const;
  type ThemeKey = (typeof THEMES)[number]["key"];

  const [theme, setTheme] = useState<ThemeKey>(() => (localStorage.getItem("theme") as ThemeKey) || "light");

  useEffect(() => {
    // Remove all theme classes, then apply current
    THEMES.forEach((t) => document.documentElement.classList.remove(`theme-${t.key}`));
    if (theme !== "light") {
      document.documentElement.classList.add(`theme-${theme}`);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Close options popover on outside click
  useEffect(() => {
    if (!optionsOpen) return;
    function handleClick(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
        setPwdOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [optionsOpen]);

  const navItems: NavItem[] = useMemo(() => [
    // ── Général ──
    { to: "/", label: "Tableau de bord", icon: LayoutDashboard, visible: true, section: "Général" },

    // ── Modules ──
    { to: "/dictee", label: "Dictée vocale", icon: Mic, visible: hasModule("transcription"), section: "Modules" },
    { to: "/reunions", label: "Réunions", icon: CalendarClock, visible: hasModule("transcription_diarisation"), section: "Modules" },
    { to: "/rgpd", label: "RGPD", icon: Shield, visible: hasModule("rgpd"), section: "Modules" },
    { to: "/procedures", label: "Procédures", icon: ClipboardList, visible: hasModule("procedures"), section: "Modules" },
    { to: "/contacts", label: "Contacts", icon: BookUser, visible: hasModule("contacts"), section: "Modules" },
    { to: "/recherche", label: "Recherche", icon: Search, visible: hasModule("search"), section: "Modules" },
    { to: "/dictionnaire", label: "Dictionnaire", icon: BookOpen, visible: hasModule("dictionary"), section: "Modules" },

    // ── Administration ──
    { to: "/admin/sectors", label: "Secteurs", icon: FolderCog, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/tenants", label: "Tenants", icon: Building2, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/users", label: "Utilisateurs", icon: Users, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/ai-settings", label: "Gestion IA", icon: Sparkles, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/templates-ia", label: "Templates IA", icon: Sparkles, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/email-settings", label: "Email (SMTP)", icon: Mail, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/announcements", label: "Communications", icon: Megaphone, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/audit-logs", label: "Journal d'audit", icon: Shield, visible: isSuperAdmin, section: "Administration" },

    // ── Compte ──
    { to: "/privacy", label: "Confidentialité", icon: Lock, visible: true, section: "Compte" },
  ], [hasModule, isSuperAdmin]);

  const visibleItems = useMemo(() => navItems.filter((item) => item.visible), [navItems]);
  const sections = useMemo(() => [...new Set(visibleItems.map((i) => i.section))], [visibleItems]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-background border-b border-border">
        <span className="font-bold text-lg">Scrib' IA</span>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-60 bg-background border-r border-border flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="px-5 py-5 border-b border-border hidden lg:block">
            <span className="font-bold text-xl tracking-tight">Scrib' IA</span>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
            {sections.map((section) => (
              <div key={section}>
                {section !== "Général" && (
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
                    {section}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems
                    .filter((item) => item.section === section)
                    .map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/"}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          )
                        }
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </NavLink>
                    ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="px-3 py-4 border-t border-border relative" ref={optionsRef}>
            {/* Options popover + password flyout */}
            {optionsOpen && (
              <div className="absolute bottom-full left-3 mb-2 flex items-end gap-2 z-10">
                {/* Main options panel */}
                <div className="w-[calc(15rem-1.5rem)] bg-popover border border-border rounded-xl p-2 shadow-lg">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-2">
                    Options
                  </p>
                  {push.supported && (
                    <>
                      <button
                        onClick={() => push.subscribed ? push.unsubscribe() : push.subscribe()}
                        disabled={push.loading || push.permission === "denied"}
                        title={push.permission === "denied" ? "Notifications bloquées dans le navigateur" : undefined}
                        className="flex items-center justify-between w-full px-2 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
                      >
                        <span className="flex items-center gap-3">
                          {push.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : push.subscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                          Notifications
                        </span>
                        <span className={cn(
                          "w-8 h-[18px] rounded-full relative transition-colors",
                          push.subscribed ? "bg-primary" : "bg-muted-foreground/30",
                        )}>
                          <span className={cn(
                            "absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform",
                            push.subscribed ? "left-[18px]" : "left-[2px]",
                          )} />
                        </span>
                      </button>
                      {push.error && (
                        <p className="px-2 text-xs text-destructive">{push.error}</p>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setPwdOpen((v) => !v)}
                    className={cn(
                      "flex items-center justify-between w-full px-2 py-2 rounded-lg text-sm transition-colors",
                      pwdOpen
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <KeyRound className="w-4 h-4" />
                      Mot de passe
                    </span>
                    <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground/50 transition-transform", pwdOpen && "rotate-180")} />
                  </button>
                  <div className="h-px bg-border my-1" />
                  <div className="flex items-center justify-between px-2 py-2">
                    <span className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Moon className="w-4 h-4" />
                      Thème
                    </span>
                    <button
                      onClick={() => setTheme(theme === "light" ? "blur" : "light")}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        theme === "blur" ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow flex items-center justify-center transition-transform",
                          theme === "blur" && "translate-x-5",
                        )}
                      >
                        {theme === "blur"
                          ? <Moon className="w-3 h-3 text-primary" />
                          : <Sun className="w-3 h-3 text-amber-500" />
                        }
                      </span>
                    </button>
                  </div>
                </div>

                {/* Password flyout panel */}
                {pwdOpen && (
                  <ChangePasswordPanel onDone={() => { setPwdOpen(false); setOptionsOpen(false); }} />
                )}
              </div>
            )}

            <div className="px-3 mb-1">
              <p className="text-sm font-medium truncate">{user?.display_name ?? user?.username}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
            <button
              onClick={() => setOptionsOpen((v) => !v)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Settings className="w-4 h-4" />
              Options
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 p-3 sm:p-6 lg:p-8 min-h-screen">
          <Outlet />
        </main>
      </div>

      <AnnouncementPopup />
    </div>
  );
}

function ChangePasswordPanel({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const changePassword = useChangePassword();
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    if (newPassword.length < 8) return;
    changePassword.mutate(
      { current_password: currentPassword, new_password: newPassword },
      {
        onSuccess: () => {
          setSuccess(true);
          setTimeout(onDone, 1500);
        },
      },
    );
  }

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;

  return (
    <div className="w-72 bg-popover border border-border rounded-xl p-4 shadow-lg">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Changer le mot de passe
      </p>

      {success ? (
        <p className="text-sm text-green-600 font-medium">Mot de passe modifié !</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <label className="block text-xs font-medium mb-1">Actuel</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Nouveau</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {tooShort && (
              <p className="text-xs text-destructive mt-1">Min. 8 caractères</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Confirmer</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {mismatch && (
              <p className="text-xs text-destructive mt-1">Ne correspondent pas</p>
            )}
          </div>

          {changePassword.isError && (
            <p className="text-xs text-destructive">
              {changePassword.error instanceof Error ? changePassword.error.message : "Erreur"}
            </p>
          )}

          <button
            type="submit"
            disabled={changePassword.isPending || mismatch || tooShort}
            className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {changePassword.isPending ? "..." : "Modifier"}
          </button>
        </form>
      )}
    </div>
  );
}
