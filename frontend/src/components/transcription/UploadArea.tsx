import { useCallback, useState } from "react";
import { Upload, FileAudio } from "lucide-react";

const ACCEPTED = ".mp3,.wav,.m4a,.ogg,.flac,.webm,.aac,.wma,.opus";

interface UploadAreaProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadArea({ onFile, disabled }: UploadAreaProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile, disabled],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      e.target.value = "";
    },
    [onFile],
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`
        flex flex-col items-center justify-center gap-3 p-4 sm:p-8 rounded-xl border-2 border-dashed
        cursor-pointer transition-colors
        ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}
        ${disabled ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
        {dragOver ? <FileAudio className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">
          Glissez un fichier audio ici ou parcourir
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          MP3, WAV, M4A, OGG, FLAC, WebM, AAC (max 500 Mo)
        </p>
      </div>
      <input
        type="file"
        accept={ACCEPTED}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
    </label>
  );
}
