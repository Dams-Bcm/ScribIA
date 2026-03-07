import { useMemo, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthContext, type AuthContextValue } from "./stores/auth";
import { useCurrentUser, useLogout } from "./api/hooks/useAuth";

import { RequireAuth } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";

// Lazy-loaded pages (code splitting)
const DashboardPage = lazy(() => import("./pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage").then(m => ({ default: m.PrivacyPage })));

// Module pages
const TranscriptionPage = lazy(() => import("./pages/modules/TranscriptionPage").then(m => ({ default: m.TranscriptionPage })));
const ReunionPage = lazy(() => import("./pages/modules/ReunionPage").then(m => ({ default: m.ReunionPage })));
const RGPDPage = lazy(() => import("./pages/modules/RGPDPage").then(m => ({ default: m.RGPDPage })));
const AIDocumentsPage = lazy(() => import("./pages/modules/AIDocumentsPage").then(m => ({ default: m.AIDocumentsPage })));
const PreparatoryPhasesPage = lazy(() => import("./pages/modules/PreparatoryPhasesPage").then(m => ({ default: m.PreparatoryPhasesPage })));
const ProceduresPage = lazy(() => import("./pages/modules/ProceduresPage").then(m => ({ default: m.ProceduresPage })));
const ContactsPage = lazy(() => import("./pages/modules/ContactsPage").then(m => ({ default: m.ContactsPage })));
const SearchPage = lazy(() => import("./pages/modules/SearchPage").then(m => ({ default: m.SearchPage })));
const DictionaryPage = lazy(() => import("./pages/modules/DictionaryPage").then(m => ({ default: m.DictionaryPage })));
const FormPage = lazy(() => import("./pages/public/FormPage").then(m => ({ default: m.FormPage })));
const ConsentResponsePage = lazy(() => import("./pages/public/ConsentResponsePage").then(m => ({ default: m.ConsentResponsePage })));

// Admin pages
const TenantsPage = lazy(() => import("./pages/admin/TenantsPage").then(m => ({ default: m.TenantsPage })));
const UsersPage = lazy(() => import("./pages/admin/UsersPage").then(m => ({ default: m.UsersPage })));
const AuditLogsPage = lazy(() => import("./pages/admin/AuditLogsPage").then(m => ({ default: m.AuditLogsPage })));
const AISettingsPage = lazy(() => import("./pages/admin/AISettingsPage").then(m => ({ default: m.AISettingsPage })));
const SectorsPage = lazy(() => import("./pages/admin/SectorsPage").then(m => ({ default: m.SectorsPage })));
const AnnouncementsPage = lazy(() => import("./pages/admin/AnnouncementsPage").then(m => ({ default: m.AnnouncementsPage })));
const EmailSettingsPage = lazy(() => import("./pages/admin/EmailSettingsPage").then(m => ({ default: m.EmailSettingsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 2 * 60 * 1000,   // 2 min par défaut
      gcTime: 10 * 60 * 1000,     // 10 min garbage collection
    },
  },
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  const logout = useLogout();

  const value = useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      isLoading,
      isAuthenticated: !!user,
      isSuperAdmin: user?.role === "super_admin",
      isAdmin: user?.role === "admin" || user?.role === "super_admin",
      hasModule: (key: string) => {
        if (!user) return false;
        if (user.role === "super_admin") return true;
        return user.enabled_modules.includes(key);
      },
      logout,
    }),
    [user, isLoading, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/form/:token" element={<FormPage />} />
        <Route path="/consent-response" element={<ConsentResponsePage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            {/* Dashboard */}
            <Route index element={<DashboardPage />} />

            {/* Modules */}
            <Route path="transcription" element={<TranscriptionPage />} />
            <Route path="reunion" element={<ReunionPage />} />
            <Route path="phases-preparatoires" element={<PreparatoryPhasesPage />} />
            <Route path="rgpd" element={<RGPDPage />} />
            <Route path="documents-ia" element={<AIDocumentsPage />} />
            <Route path="procedures" element={<ProceduresPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="recherche" element={<SearchPage />} />
            <Route path="dictionnaire" element={<DictionaryPage />} />

            {/* Compte */}
            <Route path="privacy" element={<PrivacyPage />} />

            {/* Administration */}
            <Route path="admin/tenants" element={<TenantsPage />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/sectors" element={<SectorsPage />} />
            <Route path="admin/ai-settings" element={<AISettingsPage />} />
            <Route path="admin/email-settings" element={<EmailSettingsPage />} />
            <Route path="admin/announcements" element={<AnnouncementsPage />} />
            <Route path="admin/audit-logs" element={<AuditLogsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
