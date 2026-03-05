import { Loader2, XCircle } from "lucide-react";
import { useAIDocument, useUpdateAIDocument } from "@/api/hooks/useAIDocuments";
import { RichTextEditor } from "@/components/editor/RichTextEditor";

interface Props {
  docId: string;
}

function downloadBlob(url: string, filename: string) {
  const token = localStorage.getItem("token") ?? "";
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((blob) => {
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    });
}

export function DocumentViewer({ docId }: Props) {
  const { data: doc, isLoading } = useAIDocument(docId);
  const updateDoc = useUpdateAIDocument();

  if (isLoading || !doc) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function handleSave(html: string) {
    updateDoc.mutate({ id: docId, result_text: html });
  }

  function handleExport(format: "pdf" | "docx") {
    const safeTitle = doc!.title.replace(/[/\\]/g, "-");
    downloadBlob(
      `/api/ai-documents/documents/${docId}/export?format=${format}`,
      `${safeTitle}.${format}`,
    );
  }

  return (
    <div className="space-y-4">
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
        <RichTextEditor
          initialContent={doc.result_text}
          onSave={handleSave}
          onExport={handleExport}
        />
      )}
    </div>
  );
}
