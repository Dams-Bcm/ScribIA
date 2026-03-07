import { Link } from "react-router";
import { useAuth } from "../stores/auth";
import { ModuleGuard } from "../components/ModuleGuard";
import { Mic, FileText, FolderOpen, Scale, Sparkles } from "lucide-react";

const modules = [
  {
    key: "transcription",
    label: "Dictée vocale",
    description: "Transcrivez vos enregistrements mono-locuteur",
    icon: Mic,
    color: "bg-blue-50 text-blue-600",
    to: "/transcription",
  },
  {
    key: "transcription_diarisation",
    label: "Transcription + Diarisation",
    description: "Transcription avec identification des intervenants",
    icon: FileText,
    color: "bg-purple-50 text-purple-600",
    to: "/transcription-diarisation",
  },
  {
    key: "preparatory_phases",
    label: "Phase(s) préparatoire(s)",
    description: "Préparation de documents avant convocation",
    icon: FolderOpen,
    color: "bg-orange-50 text-orange-600",
    to: "/phases-preparatoires",
  },
  {
    key: "legal_compliance",
    label: "Conformité légale",
    description: "Vérification et suivi de conformité",
    icon: Scale,
    color: "bg-amber-50 text-amber-600",
    to: "/conformite",
  },
  {
    key: "ai_documents",
    label: "Génération de documents IA",
    description: "Résumés, procès-verbaux et documents générés par IA",
    icon: Sparkles,
    color: "bg-emerald-50 text-emerald-600",
    to: "/documents-ia",
  },
];

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Tableau de bord</h1>
      <p className="text-muted-foreground mb-6">
        Bienvenue, {user?.display_name ?? user?.username}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <ModuleGuard key={mod.key} module={mod.key}>
            <Link to={mod.to}>
              <div className="bg-background rounded-xl border border-border p-5 hover:shadow-sm transition-shadow cursor-pointer">
                <div className={`w-10 h-10 rounded-lg ${mod.color} flex items-center justify-center mb-3`}>
                  <mod.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{mod.label}</h3>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
              </div>
            </Link>
          </ModuleGuard>
        ))}
      </div>
    </div>
  );
}
