import { Download, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAIDocument } from "@/api/hooks/useAIDocuments";

interface Props {
  docId: string;
}

export function DocumentViewer({ docId }: Props) {
  const { data: doc, isLoading } = useAIDocument(docId);

  if (isLoading || !doc) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function handleExport(format: "md" | "txt") {
    const token = localStorage.getItem("token") ?? "";
    fetch(`/api/ai-documents/documents/${docId}/export?format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${doc!.title}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{doc.title}</h3>
          <p className="text-xs text-muted-foreground">
            Créé le{" "}
            {new Date(doc.created_at).toLocaleDateString("fr-FR", {
              day: "2-digit", month: "long", year: "numeric",
            })}
            {doc.generation_completed_at && (
              <> · Généré en{" "}
                {Math.round(
                  (new Date(doc.generation_completed_at).getTime() -
                    new Date(doc.created_at).getTime()) / 1000
                )}s
              </>
            )}
          </p>
        </div>

        {doc.status === "completed" && (
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => handleExport("md")}>
              <Download className="w-3.5 h-3.5 mr-1" /> .md
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("txt")}>
              <Download className="w-3.5 h-3.5 mr-1" /> .txt
            </Button>
          </div>
        )}
      </div>

      {doc.status === "pending" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          En attente de génération…
        </div>
      )}

      {doc.status === "generating" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Génération en cours…
        </div>
      )}

      {doc.status === "error" && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-4">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{doc.error_message ?? "Erreur inconnue"}</span>
        </div>
      )}

      {doc.status === "completed" && doc.result_text && (
        <div className="border border-border rounded-lg bg-background">
          <pre className="p-4 text-sm whitespace-pre-wrap break-words font-sans leading-relaxed max-h-[60vh] overflow-y-auto">
            {doc.result_text}
          </pre>
        </div>
      )}
    </div>
  );
}
