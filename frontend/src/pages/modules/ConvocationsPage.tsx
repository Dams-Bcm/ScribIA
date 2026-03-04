import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConvocationsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Convocations</h1>
      <p className="text-muted-foreground mb-6">Création et envoi de convocations</p>

      <div className="bg-background rounded-xl border border-border p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Aucune convocation</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Créez et envoyez des convocations à vos participants
          </p>
          <Button>
            <Plus className="w-4 h-4" />
            Nouvelle convocation
          </Button>
        </div>
      </div>
    </div>
  );
}
