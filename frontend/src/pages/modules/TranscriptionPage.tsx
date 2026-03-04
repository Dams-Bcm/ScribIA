import { Mic, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TranscriptionPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Transcription simple</h1>
      <p className="text-muted-foreground mb-6">Convertissez vos fichiers audio en texte</p>

      <div className="bg-background rounded-xl border border-border p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Mic className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Aucune transcription</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Importez un fichier audio pour lancer une transcription automatique
          </p>
          <Button>
            <Upload className="w-4 h-4" />
            Importer un fichier audio
          </Button>
        </div>
      </div>
    </div>
  );
}
