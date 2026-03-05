import { useEffect, useRef, useState } from "react";
import { Copy, Download, Check, Play, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TranscriptionSegment } from "@/api/types";

interface TranscriptionResultProps {
  segments: TranscriptionSegment[];
  jobId: string;
  title: string;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TranscriptionResult({ segments, jobId, title }: TranscriptionResultProps) {
  const [copied, setCopied] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playingSegId, setPlayingSegId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);

  // Charger l'audio comme blob URL (pour passer le token d'auth)
  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    fetch(`/api/transcription/${jobId}/audio`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) return null;
        return r.blob();
      })
      .then((blob) => {
        if (blob) setAudioUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});

    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function playSeg(seg: TranscriptionSegment) {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingSegId === seg.id) {
      // Pause si déjà en cours
      audio.pause();
      setPlayingSegId(null);
      return;
    }

    stopAtRef.current = seg.end_time;
    audio.currentTime = seg.start_time;
    audio.play();
    setPlayingSegId(seg.id);
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || stopAtRef.current === null) return;
    if (audio.currentTime >= stopAtRef.current) {
      audio.pause();
      setPlayingSegId(null);
      stopAtRef.current = null;
    }
  }

  const fullText = segments.map((s) => s.text).join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = (format: "txt" | "srt" | "vtt") => {
    const token = localStorage.getItem("token");
    const url = `/api/transcription/${jobId}/export?format=${format}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${title.replace(/\s+/g, "_").slice(0, 50)}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copié" : "Copier"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("txt")}>
          <Download className="w-4 h-4" />
          TXT
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("srt")}>
          <Download className="w-4 h-4" />
          SRT
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("vtt")}>
          <Download className="w-4 h-4" />
          VTT
        </Button>
      </div>

      {/* Lecteur audio (masqué, contrôlé par les boutons segments) */}
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlayingSegId(null)}
          className="hidden"
        />
      ) : (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Chargement de l'audio…
        </div>
      )}

      {/* Segments */}
      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {segments.map((seg) => {
          const isPlaying = playingSegId === seg.id;
          return (
            <div
              key={seg.id}
              className={`flex gap-3 py-2 px-2 rounded-lg border-b border-border last:border-0 transition-colors ${
                isPlaying ? "bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <button
                onClick={() => playSeg(seg)}
                disabled={!audioUrl}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
                title={isPlaying ? "Pause" : "Écouter ce segment"}
              >
                {isPlaying ? (
                  <Pause className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </button>
              <span className="text-xs text-muted-foreground font-mono whitespace-nowrap pt-0.5 min-w-[4rem]">
                {formatTime(seg.start_time)}
              </span>
              <p className="text-sm leading-relaxed">{seg.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
