import { useAuth } from "../stores/auth";
import { ModuleGuard } from "../components/ModuleGuard";
import { Mic, FileText, Scale, Sparkles, Mail } from "lucide-react";

export function DashboardPage() {
  const { user } = useAuth();

  const modules = [
    {
      key: "transcription",
      label: "Transcription simple",
      description: "Convertissez vos fichiers audio en texte",
      icon: Mic,
      color: "bg-blue-50 text-blue-600",
    },
    {
      key: "transcription_diarisation",
      label: "Transcription + Diarisation",
      description: "Transcription avec identification des intervenants",
      icon: FileText,
      color: "bg-purple-50 text-purple-600",
    },
    {
      key: "legal_compliance",
      label: "Conformité légale",
      description: "Vérification et suivi de conformité",
      icon: Scale,
      color: "bg-amber-50 text-amber-600",
    },
    {
      key: "ai_documents",
      label: "Génération de documents IA",
      description: "Résumés, procès-verbaux et documents générés par IA",
      icon: Sparkles,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      key: "convocations",
      label: "Convocations",
      description: "Création et envoi de convocations",
      icon: Mail,
      color: "bg-rose-50 text-rose-600",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Tableau de bord</h1>
      <p className="text-muted-foreground mb-6">
        Bienvenue, {user?.display_name ?? user?.username}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <ModuleGuard key={mod.key} module={mod.key}>
            <div className="bg-background rounded-xl border border-border p-5 hover:shadow-sm transition-shadow cursor-pointer">
              <div className={`w-10 h-10 rounded-lg ${mod.color} flex items-center justify-center mb-3`}>
                <mod.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-sm mb-1">{mod.label}</h3>
              <p className="text-xs text-muted-foreground">{mod.description}</p>
            </div>
          </ModuleGuard>
        ))}
      </div>
    </div>
  );
}
