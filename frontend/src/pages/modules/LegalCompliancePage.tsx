import { Scale } from "lucide-react";

export function LegalCompliancePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Conformité légale</h1>
      <p className="text-muted-foreground mb-6">Vérification et suivi de conformité</p>

      <div className="bg-background rounded-xl border border-border p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
            <Scale className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Module conformité</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Configurez les règles de conformité pour votre tenant
          </p>
        </div>
      </div>
    </div>
  );
}
