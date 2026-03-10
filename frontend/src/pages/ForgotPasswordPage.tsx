import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useForgotPassword } from "../api/hooks/useAuth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgot = useForgotPassword();
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    forgot.mutate({ email }, { onSuccess: () => setSent(true) });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-background rounded-xl border border-border p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-center mb-1">Scrib' IA</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Réinitialisation du mot de passe
          </p>

          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-green-600 font-medium text-center">
                Si un compte existe avec cette adresse email, vous recevrez un lien de réinitialisation.
              </p>
              <Link
                to="/login"
                className="block text-center text-sm text-primary hover:underline"
              >
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                  Adresse email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="votre@email.fr"
                />
              </div>

              {forgot.isError && (
                <p className="text-sm text-destructive">
                  {forgot.error instanceof Error ? forgot.error.message : "Erreur"}
                </p>
              )}

              <button
                type="submit"
                disabled={forgot.isPending}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {forgot.isPending ? "Envoi..." : "Envoyer le lien"}
              </button>

              <Link
                to="/login"
                className="block text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Retour à la connexion
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
