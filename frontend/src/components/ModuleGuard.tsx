import type { ReactNode } from "react";
import { useAuth } from "../stores/auth";

interface ModuleGuardProps {
  module: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only if the current user's tenant has the specified module enabled.
 * Super admins always pass the check.
 */
export function ModuleGuard({ module, children, fallback = null }: ModuleGuardProps) {
  const { hasModule } = useAuth();

  if (!hasModule(module)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
