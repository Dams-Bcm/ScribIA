import { useState } from "react";
import { Check, Pencil, X, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/stores/auth";
import type { DiarisationSpeaker } from "@/api/types";
import { getSpeakerColor } from "./speakerColors";
import { EnrollSpeakerModal } from "./EnrollSpeakerModal";

interface SpeakerPanelProps {
  speakers: DiarisationSpeaker[];
  jobId: string;
  onRename: (speakerId: string, displayName: string) => void;
  onEnrolled?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export function SpeakerPanel({ speakers, jobId, onRename, onEnrolled }: SpeakerPanelProps) {
  const { isAdmin } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [enrollingSpeaker, setEnrollingSpeaker] = useState<DiarisationSpeaker | null>(null);

  const startEdit = (speaker: DiarisationSpeaker) => {
    setEditingId(speaker.speaker_id);
    setEditValue(speaker.display_name || speaker.speaker_id);
  };

  const confirmEdit = (speakerId: string) => {
    if (editValue.trim()) {
      onRename(speakerId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold mb-3">Intervenants ({speakers.length})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1 gap-2">
        {speakers.map((speaker) => {
          const color = getSpeakerColor(speaker.color_index);
          const isEditing = editingId === speaker.speaker_id;
          const isLinked = !!speaker.profile_id;

          return (
            <div
              key={speaker.id}
              className={`rounded-lg border ${color.border} ${color.bg} p-2 sm:p-3`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color.dot}`} />
                {isEditing ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit(speaker.speaker_id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="text-sm font-medium bg-white/80 border border-border rounded px-2 py-0.5 flex-1 min-w-0"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => confirmEdit(speaker.speaker_id)}>
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={cancelEdit}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className={`text-sm font-medium ${color.text} flex-1 truncate min-w-0`}>
                      {speaker.display_name || speaker.speaker_id}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => startEdit(speaker)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 flex-shrink-0 ${isLinked ? "text-green-600 hover:text-green-700" : "text-muted-foreground"}`}
                        title={isLinked ? "Profil lié — modifier" : "Lier à un profil intervenant"}
                        onClick={() => setEnrollingSpeaker(speaker)}
                      >
                        <UserCheck className="w-3 h-3" />
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground ml-[1.125rem]">
                <span>{speaker.segment_count} seg.</span>
                <span>{formatDuration(speaker.total_duration)}</span>
                {isLinked && (
                  <span className="text-green-600 font-medium hidden sm:inline">Profil lié</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {enrollingSpeaker && (
        <EnrollSpeakerModal
          speaker={enrollingSpeaker}
          jobId={jobId}
          onClose={() => setEnrollingSpeaker(null)}
          onSuccess={() => {
            setEnrollingSpeaker(null);
            onEnrolled?.();
          }}
        />
      )}
    </div>
  );
}
