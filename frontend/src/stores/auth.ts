import { createContext, useContext } from "react";
import type { User } from "../api/types";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  hasModule: (moduleKey: string) => boolean;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isSuperAdmin: false,
  isAdmin: false,
  hasModule: () => false,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
