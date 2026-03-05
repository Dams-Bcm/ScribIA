import { useState } from "react";
import { Sparkles, FileText, Settings2 } from "lucide-react";
import { GenerateDialog } from "@/components/ai_documents/GenerateDialog";
import { DocumentList } from "@/components/ai_documents/DocumentList";
import { DocumentViewer } from "@/components/ai_documents/DocumentViewer";
import { TemplateManager } from "@/components/ai_documents/TemplateManager";
import { ModelManager } from "@/components/ai_documents/ModelManager";
import { useAuth } from "@/stores/auth";
import type { AIDocument } from "@/api/types";

type Tab = "generate" | "documents" | "templates";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "generate",  label: "Générer",          icon: <Sparkles className="w-4 h-4" /> },
  { key: "documents", label: "Documents générés", icon: <FileText className="w-4 h-4" /> },
  { key: "templates", label: "Templates",         icon: <Settings2 className="w-4 h-4" /> },
];

export function AIDocumentsPage() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("generate");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  function handleGenerated(doc: AIDocument) {
    setSelectedDocId(doc.id);
    setTab("documents");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Documents IA</h1>
      <p className="text-muted-foreground mb-6">
        Génération de procès-verbaux, délibérations et résumés via LLM
      </p>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Onglet Générer */}
      {tab === "generate" && (
        <div className="space-y-6">
          <div className="bg-background rounded-xl border border-border p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Sparkles className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-1">Générer un document</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Choisissez un template, sélectionnez vos sources (dossier préparatoire
                  et/ou transcription) et lancez la génération.
                </p>
              </div>
              <GenerateDialog onGenerated={handleGenerated} />
            </div>
          </div>

          <div className="bg-muted/30 rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Placeholders automatiques :</span>{" "}
              <code>{"{organisation}"}</code>, <code>{"{date}"}</code>,{" "}
              <code>{"{titre}"}</code>, <code>{"{points}"}</code>,{" "}
              <code>{"{transcription}"}</code>, <code>{"{documents}"}</code>,{" "}
              <code>{"{duree}"}</code>
            </p>
          </div>
        </div>
      )}

      {/* Onglet Documents générés */}
      {tab === "documents" && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <div className="bg-background rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Documents</h2>
              <GenerateDialog onGenerated={handleGenerated} />
            </div>
            <DocumentList
              selectedId={selectedDocId}
              onSelect={setSelectedDocId}
            />
          </div>

          <div className="bg-background rounded-xl border border-border p-6">
            {selectedDocId ? (
              <DocumentViewer docId={selectedDocId} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Sélectionnez un document pour l'afficher
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Onglet Templates */}
      {tab === "templates" && (
        <div className="bg-background rounded-xl border border-border p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Templates de génération</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configurez les prompts système et utilisateur pour chaque type de document.
                Les templates par défaut sont créés automatiquement.
              </p>
            </div>
            {isSuperAdmin && <ModelManager />}
          </div>
          <TemplateManager />
        </div>
      )}
    </div>
  );
}
