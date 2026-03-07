import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/api/client";

export function ConsentResponsePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const action = params.get("action");

  const [status, setStatus] = useState<"loading" | "success" | "refused" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !action) {
      setStatus("error");
      setMessage("Lien invalide : paramètres manquants.");
      return;
    }

    api
      .get(`/consent/respond/${token}?action=${action}`)
      .then((res) => {
        const data = res as { status: string; message: string };
        setMessage(data.message);
        setStatus(data.status === "accepted" ? "success" : "refused");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err?.message || "Une erreur est survenue.");
      });
  }, [token, action]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
            <p className="text-gray-600">Traitement en cours...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-semibold text-green-700">Consentement accept&eacute;</h1>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === "refused" && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-semibold text-red-700">Refus enregistr&eacute;</h1>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <h1 className="text-xl font-semibold text-amber-700">Erreur</h1>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status !== "loading" && (
          <p className="text-xs text-gray-400 pt-4">Vous pouvez fermer cette page.</p>
        )}
      </div>
    </div>
  );
}
