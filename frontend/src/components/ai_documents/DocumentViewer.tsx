import { Loader2, XCircle, ShieldAlert } from "lucide-react";
import { useAIDocument, useUpdateAIDocument } from "@/api/hooks/useAIDocuments";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { useAuth } from "@/stores/auth";

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
  const { hasModule } = useAuth();
  const { data: doc, isLoading, dataUpdatedAt } = useAIDocument(docId);
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

      {doc.invalidated_at && (
        <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200 rounded-lg p-4">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Document invalidé</p>
            <p>{doc.invalidated_reason}</p>
            <p className="text-xs mt-1 opacity-70">
              L'export de ce document est bloqué.
            </p>
          </div>
        </div>
      )}

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
          key={dataUpdatedAt}
          initialContent={doc.result_text}
          onSave={doc.invalidated_at ? undefined : handleSave}
          onExport={doc.invalidated_at ? undefined : handleExport}
          dictionary={hasModule("dictionary") ? { targetType: "ai_document", targetId: docId } : undefined}
        />
      )}
    </div>
  );
}
