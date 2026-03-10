import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useLogin } from "../api/hooks/useAuth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync({ username, password });
      window.location.href = "/";
    } catch {
      // error handled by mutation state
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-background rounded-xl border border-border p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-center mb-1">Scrib' IA</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Optimisez votre travail par l'écoute
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1.5">
                Identifiant
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {login.isError && (
              <p className="text-sm text-destructive">
                {login.error instanceof Error ? login.error.message : "Erreur de connexion"}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {login.isPending ? "Connexion..." : "Se connecter"}
            </button>

            <Link
              to="/forgot-password"
              className="block text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Mot de passe oublié ?
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
