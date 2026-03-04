import { Sparkles } from "lucide-react";

export function AIDocumentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Génération de documents IA</h1>
      <p className="text-muted-foreground mb-6">Résumés, procès-verbaux et documents générés par IA</p>

      <div className="bg-background rounded-xl border border-border p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Aucun document</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Les documents IA seront générés à partir de vos transcriptions
          </p>
        </div>
      </div>
    </div>
  );
}
