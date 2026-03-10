import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useResetPassword } from "../api/hooks/useAuth";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const reset = useResetPassword();
  const [done, setDone] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword || newPassword.length < 8) return;
    reset.mutate({ token, new_password: newPassword }, { onSuccess: () => setDone(true) });
  }

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="bg-background rounded-xl border border-border p-8 shadow-sm max-w-sm w-full text-center">
          <p className="text-sm text-destructive mb-4">Lien invalide ou expiré.</p>
          <Link to="/login" className="text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-background rounded-xl border border-border p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-center mb-1">Scrib' IA</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Nouveau mot de passe
          </p>

          {done ? (
            <div className="space-y-4">
              <p className="text-sm text-green-600 font-medium text-center">
                Votre mot de passe a été réinitialisé avec succès.
              </p>
              <Link
                to="/login"
                className="block text-center text-sm text-primary hover:underline font-medium"
              >
                Se connecter
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium mb-1.5">
                  Nouveau mot de passe
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {tooShort && (
                  <p className="text-xs text-destructive mt-1">Minimum 8 caractères</p>
                )}
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5">
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {mismatch && (
                  <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              {reset.isError && (
                <p className="text-sm text-destructive">
                  {reset.error instanceof Error ? reset.error.message : "Erreur"}
                </p>
              )}

              <button
                type="submit"
                disabled={reset.isPending || mismatch || tooShort}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {reset.isPending ? "..." : "Réinitialiser"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
