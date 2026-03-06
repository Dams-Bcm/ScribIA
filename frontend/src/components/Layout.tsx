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
  FileText,
  Sparkles,
  Shield,
  Lock,
  FolderOpen,
  ClipboardList,
  BookUser,
  Settings2,
  FolderCog,
  Search,
  BookOpen,
  Megaphone,
} from "lucide-react";
import { useState } from "react";
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

  const navItems: NavItem[] = [
    // ── Général ──
    { to: "/", label: "Tableau de bord", icon: LayoutDashboard, visible: true, section: "Général" },

    // ── Modules ──
    { to: "/transcription", label: "Transcription", icon: Mic, visible: hasModule("transcription"), section: "Modules" },
    { to: "/transcription-diarisation", label: "T + Diarisation", icon: FileText, visible: hasModule("transcription_diarisation"), section: "Modules" },
    { to: "/phases-preparatoires", label: "Phases prép.", icon: FolderOpen, visible: hasModule("preparatory_phases"), section: "Modules" },
    { to: "/rgpd", label: "RGPD", icon: Shield, visible: hasModule("rgpd"), section: "Modules" },
    { to: "/documents-ia", label: "Documents IA", icon: Sparkles, visible: hasModule("ai_documents"), section: "Modules" },
    { to: "/procedures", label: "Procédures", icon: ClipboardList, visible: hasModule("procedures"), section: "Modules" },
    { to: "/contacts", label: "Contacts", icon: BookUser, visible: hasModule("contacts"), section: "Modules" },
    { to: "/recherche", label: "Recherche", icon: Search, visible: hasModule("search"), section: "Modules" },
    { to: "/dictionnaire", label: "Dictionnaire", icon: BookOpen, visible: hasModule("dictionary"), section: "Modules" },

    // ── Administration ──
    { to: "/admin/tenants", label: "Tenants", icon: Building2, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/users", label: "Utilisateurs", icon: Users, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/sectors", label: "Secteurs", icon: FolderCog, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/workflows", label: "Workflows", icon: Settings2, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/ai-settings", label: "Gestion IA", icon: Sparkles, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/announcements", label: "Communications", icon: Megaphone, visible: isSuperAdmin, section: "Administration" },
    { to: "/admin/audit-logs", label: "Journal d'audit", icon: Shield, visible: isSuperAdmin, section: "Administration" },

    // ── Compte ──
    { to: "/privacy", label: "Confidentialité", icon: Lock, visible: true, section: "Compte" },
  ];

  const visibleItems = navItems.filter((item) => item.visible);
  const sections = [...new Set(visibleItems.map((i) => i.section))];

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

          <div className="px-3 py-4 border-t border-border">
            <div className="px-3 mb-3">
              <p className="text-sm font-medium truncate">{user?.display_name ?? user?.username}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
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
        <main className="flex-1 p-6 lg:p-8 min-h-screen">
          <Outlet />
        </main>
      </div>

      <AnnouncementPopup />
    </div>
  );
}
