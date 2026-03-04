import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TranscriptionDiarisationPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Transcription + Diarisation</h1>
      <p className="text-muted-foreground mb-6">Transcription avec identification des intervenants</p>

      <div className="bg-background rounded-xl border border-border p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Aucune séance</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Importez un fichier audio pour lancer une transcription avec identification des intervenants
          </p>
          <Button>
            <Upload className="w-4 h-4" />
            Nouvelle séance
          </Button>
        </div>
      </div>
    </div>
  );
}
