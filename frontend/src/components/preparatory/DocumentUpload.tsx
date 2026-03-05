import { useRef, useState } from "react";
import { Upload, FileText, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadDocument, useDeleteDocument } from "@/api/hooks/usePreparatoryPhases";
import type { DossierDocument } from "@/api/types";

interface DocumentUploadProps {
  dossierId: string;
  agendaPointId?: string;
  documents: DossierDocument[];
  label?: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function downloadFile(dossierId: string, docId: string, filename: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/preparatory-phases/${dossierId}/documents/${docId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocumentUpload({ dossierId, agendaPointId, documents, label }: DocumentUploadProps) {
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const filteredDocs = documents.filter((d) =>
    agendaPointId ? d.agenda_point_id === agendaPointId : !d.agenda_point_id,
  );

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      uploadDoc.mutate({ dossierId, file, agendaPointId });
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDelete = (docId: string) => {
    if (confirm("Supprimer ce document ?")) {
      deleteDoc.mutate({ dossierId, docId });
    }
  };

  return (
    <div>
      {label && <h3 className="text-sm font-semibold mb-2">{label}</h3>}

      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-3 ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-border hover:border-muted-foreground/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploadDoc.isPending ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        ) : (
          <>
            <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">
              Glisser-déposer ou cliquer pour ajouter un document
            </p>
          </>
        )}
      </div>

      {/* File list */}
      {filteredDocs.length > 0 && (
        <div className="space-y-1">
          {filteredDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-1.5">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{doc.original_filename}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatSize(doc.file_size)}</span>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0"
                onClick={() => downloadFile(dossierId, doc.id, doc.original_filename)}
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(doc.id)}>
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
