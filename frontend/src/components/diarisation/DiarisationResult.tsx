import { useEffect, useRef, useState } from "react";
import { Copy, Download, Check, Play, Pause, Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplyDictionaryButton } from "@/components/dictionary/ApplyDictionaryButton";
import { useAuth } from "@/stores/auth";
import type { DiarisationSegment, DiarisationSpeaker } from "@/api/types";
import { getSpeakerColor } from "./speakerColors";
import { SpeakerPanel } from "./SpeakerPanel";
import { EnrollFromSelectionModal } from "./EnrollFromSelectionModal";

interface DiarisationResultProps {
  segments: DiarisationSegment[];
  speakers: DiarisationSpeaker[];
  jobId: string;
  title: string;
  onRenameSpeaker: (speakerId: string, displayName: string) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DiarisationResult({ segments, speakers, jobId, title, onRenameSpeaker }: DiarisationResultProps) {
  const { isSuperAdmin } = useAuth();
  const [copied, setCopied] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playingSegId, setPlayingSegId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);

  // Segment selection for enrollment
  const [selectedSegIds, setSelectedSegIds] = useState<Set<string>>(new Set());
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const lastClickedRef = useRef<number | null>(null);

  // Charger l'audio comme blob URL (pour passer le token d'auth)
  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    fetch(`/api/diarisation/${jobId}/audio`, {
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

  function playSeg(seg: DiarisationSegment) {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingSegId === seg.id) {
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

  function toggleSegment(segId: string, index: number, shiftKey: boolean) {
    setSelectedSegIds((prev) => {
      const next = new Set(prev);

      if (shiftKey && lastClickedRef.current !== null) {
        // Range select
        const start = Math.min(lastClickedRef.current, index);
        const end = Math.max(lastClickedRef.current, index);
        for (let i = start; i <= end && i < segments.length; i++) {
          next.add(segments[i]!.id);
        }
      } else {
        if (next.has(segId)) {
          next.delete(segId);
        } else {
          next.add(segId);
        }
      }

      lastClickedRef.current = index;
      return next;
    });
  }

  function clearSelection() {
    setSelectedSegIds(new Set());
    lastClickedRef.current = null;
  }

  const selectedSegments = segments.filter((s) => selectedSegIds.has(s.id));

  // Build speaker maps
  const speakerColorMap = new Map<string, number>();
  for (const sp of speakers) {
    speakerColorMap.set(sp.speaker_id, sp.color_index);
  }
  const speakerLabelMap = new Map<string, string>();
  for (const sp of speakers) {
    speakerLabelMap.set(sp.speaker_id, sp.display_name || sp.speaker_id);
  }

  const fullText = segments
    .map((s) => {
      const label = s.speaker_label || s.speaker_id || "";
      return label ? `[${label}] ${s.text}` : s.text;
    })
    .join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = (format: "txt" | "srt" | "vtt") => {
    const token = localStorage.getItem("token");
    const url = `/api/diarisation/${jobId}/export?format=${format}`;
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
          {copied ? "Copie" : "Copier"}
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
        <ApplyDictionaryButton
          targetType="transcription"
          targetId={jobId}
          previewText={segments.map((s) => s.text).join("\n")}
        />
      </div>

      {/* Lecteur audio (masque, controle par les boutons segments) */}
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
          Chargement de l&apos;audio...
        </div>
      )}

      {/* Selection floating bar */}
      {isSuperAdmin && selectedSegIds.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2">
          <span className="text-sm font-medium">
            {selectedSegIds.size} segment{selectedSegIds.size > 1 ? "s" : ""} selectionne{selectedSegIds.size > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="default"
            className="ml-auto"
            onClick={() => setShowEnrollModal(true)}
          >
            <UserPlus className="w-4 h-4 mr-1" />
            Enroller
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Two-column layout: speakers + segments */}
      <div className="flex gap-4">
        {/* Speaker panel */}
        <div className="w-64 flex-shrink-0">
          <SpeakerPanel speakers={speakers} jobId={jobId} onRename={onRenameSpeaker} />
        </div>

        {/* Segments */}
        <div className="flex-1 space-y-1 max-h-[60vh] overflow-y-auto">
          {isSuperAdmin && (
            <p className="text-xs text-muted-foreground mb-2">
              Cliquez sur les segments pour les selectionner (Shift+clic pour une plage), puis &quot;Enroller&quot;.
            </p>
          )}
          {segments.map((seg, index) => {
            const colorIndex = speakerColorMap.get(seg.speaker_id ?? "") ?? 0;
            const color = getSpeakerColor(colorIndex);
            const label = speakerLabelMap.get(seg.speaker_id ?? "") || seg.speaker_label || seg.speaker_id || "";
            const isPlaying = playingSegId === seg.id;
            const isSelected = selectedSegIds.has(seg.id);

            return (
              <div
                key={seg.id}
                className={`flex gap-2 py-2 border-l-4 ${color.border} pl-3 rounded-r-lg transition-colors ${
                  isSelected
                    ? "bg-primary/10 ring-1 ring-primary/30"
                    : isPlaying
                      ? "bg-primary/5"
                      : "hover:bg-muted/40"
                } ${isSuperAdmin ? "cursor-pointer" : ""}`}
                onClick={(e) => {
                  if (!isSuperAdmin) return;
                  // Don't select when clicking play button
                  if ((e.target as HTMLElement).closest("button")) return;
                  toggleSegment(seg.id, index, e.shiftKey);
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playSeg(seg);
                  }}
                  disabled={!audioUrl}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
                  title={isPlaying ? "Pause" : "Ecouter ce segment"}
                >
                  {isPlaying ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </button>
                <div className="flex flex-col items-start gap-0.5 min-w-[5rem]">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}>
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatTime(seg.start_time)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed flex-1">{seg.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enrollment modal */}
      {showEnrollModal && selectedSegments.length > 0 && (
        <EnrollFromSelectionModal
          segments={selectedSegments}
          jobId={jobId}
          onClose={() => setShowEnrollModal(false)}
          onSuccess={() => {
            clearSelection();
          }}
        />
      )}
    </div>
  );
}
