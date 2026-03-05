import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioRecorderProps {
  onRecording: (blob: Blob) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecording, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Choisir le mimeType supporté par le navigateur
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"]
        .find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.current.length > 0) {
          const type = mimeType || "audio/webm";
          const blob = new Blob(chunks.current, { type });
          onRecording(blob);
        }
        setRecording(false);
        setElapsed(0);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      mediaRecorder.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("Permission") || msg.includes("denied")
        ? "Accès au microphone refusé"
        : "Impossible d'accéder au microphone");
    }
  }, [onRecording]);

  const stop = useCallback(() => {
    mediaRecorder.current?.stop();
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-2">
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      <div className="flex items-center gap-3">
      {recording ? (
        <>
          <Button variant="destructive" size="sm" onClick={stop}>
            <Square className="w-4 h-4" />
            Arrêter
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {mm}:{ss}
          </div>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={start} disabled={disabled}>
          <Mic className="w-4 h-4" />
          Enregistrer
        </Button>
      )}
      </div>
    </div>
  );
}
