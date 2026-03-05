import { useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthContext, type AuthContextValue } from "./stores/auth";
import { useCurrentUser, useLogout } from "./api/hooks/useAuth";

import { RequireAuth } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PrivacyPage } from "./pages/PrivacyPage";

// Module pages
import { TranscriptionPage } from "./pages/modules/TranscriptionPage";
import { TranscriptionDiarisationPage } from "./pages/modules/TranscriptionDiarisationPage";
import { RGPDPage } from "./pages/modules/RGPDPage";
import { AIDocumentsPage } from "./pages/modules/AIDocumentsPage";
import { ConvocationsPage } from "./pages/modules/ConvocationsPage";
import { PreparatoryPhasesPage } from "./pages/modules/PreparatoryPhasesPage";
import { ProceduresPage } from "./pages/modules/ProceduresPage";
import { FormPage } from "./pages/public/FormPage";

// Admin pages
import { OrganizationsPage } from "./pages/admin/OrganizationsPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { SpeakersPage } from "./pages/admin/SpeakersPage";
import { AuditLogsPage } from "./pages/admin/AuditLogsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/form/:token" element={<FormPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          {/* Dashboard */}
          <Route index element={<DashboardPage />} />

          {/* Modules */}
          <Route path="transcription" element={<TranscriptionPage />} />
          <Route path="transcription-diarisation" element={<TranscriptionDiarisationPage />} />
          <Route path="phases-preparatoires" element={<PreparatoryPhasesPage />} />
          <Route path="rgpd" element={<RGPDPage />} />
          <Route path="documents-ia" element={<AIDocumentsPage />} />
          <Route path="convocations" element={<ConvocationsPage />} />
          <Route path="procedures" element={<ProceduresPage />} />

          {/* Compte */}
          <Route path="privacy" element={<PrivacyPage />} />

          {/* Administration */}
          <Route path="admin/organizations" element={<OrganizationsPage />} />
          <Route path="admin/users" element={<UsersPage />} />
          <Route path="admin/speakers" element={<SpeakersPage />} />
          <Route path="admin/audit-logs" element={<AuditLogsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
