import { useState } from "react";
import { CalendarDays, Mic, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useProcedure, useUpdateProcedure } from "@/api/hooks/useProcedures";
import { ParticipantManager } from "./ParticipantManager";
import type { ProcedureStatus } from "@/api/types";

const STATUS_LABELS: Record<ProcedureStatus, string> = {
  draft:      "Brouillon",
  collecting: "Collecte en cours",
  scheduled:  "Planifiée",
  meeting:    "Réunion tenue",
  generating: "Génération IA",
  done:       "Terminée",
};

const STATUS_FLOW: ProcedureStatus[] = [
  "draft", "collecting", "scheduled", "meeting", "generating", "done",
];

interface Props {
  procedureId: string;
}

export function ProcedureDetail({ procedureId }: Props) {
  const { data: proc, isLoading } = useProcedure(procedureId);
  const update = useUpdateProcedure();
  const [meetingDate, setMeetingDate] = useState("");
  const [showResponses, setShowResponses] = useState<string | null>(null);

  if (isLoading || !proc) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
      Chargement…
    </div>
  );

  const currentIdx = STATUS_FLOW.indexOf(proc.status as ProcedureStatus);

  function handleSetMeetingDate() {
    if (!meetingDate) return;
    update.mutate({ id: proc!.id, meeting_date: new Date(meetingDate).toISOString(), status: "scheduled" });
    setMeetingDate("");
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h3 className="font-semibold text-lg">{proc.title}</h3>
        {proc.description && (
          <p className="text-sm text-muted-foreground mt-1">{proc.description}</p>
        )}
      </div>

      {/* Timeline statut */}
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_FLOW.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <Badge
              variant={i <= currentIdx ? "default" : "secondary"}
              className={`text-xs ${i < currentIdx ? "opacity-50" : ""}`}
            >
              {STATUS_LABELS[s]}
            </Badge>
            {i < STATUS_FLOW.length - 1 && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Participants */}
      <div className="border border-border rounded-lg p-4">
        <ParticipantManager procedure={proc} />
      </div>

      {/* Réponses collectées */}
      {proc.participants.some((p) => p.responded_at) && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">Réponses collectées</p>
          {proc.participants
            .filter((p) => p.responded_at && p.responses)
            .map((p) => (
              <div key={p.id} className="border border-border rounded p-3 space-y-2">
                <button
                  className="flex items-center justify-between w-full text-sm font-medium"
                  onClick={() => setShowResponses(showResponses === p.id ? null : p.id)}
                >
                  <span>{p.name} <span className="text-muted-foreground font-normal">· {p.role_name}</span></span>
                  {showResponses === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showResponses === p.id && p.responses && (
                  <div className="space-y-2 pt-1">
                    {p.form_questions.map((q) => (
                      <div key={q.id}>
                        <p className="text-xs font-medium text-muted-foreground">{q.label}</p>
                        <p className="text-sm">{p.responses![q.id] ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Planification */}
      {(proc.status === "collecting" || proc.status === "scheduled") && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Planification de la réunion
          </p>
          {proc.meeting_date ? (
            <p className="text-sm">
              Réunion prévue le{" "}
              <strong>
                {new Date(proc.meeting_date).toLocaleDateString("fr-FR", {
                  day: "2-digit", month: "long", year: "numeric",
                })}
              </strong>
            </p>
          ) : (
            <div className="flex gap-2">
              <Input
                type="datetime-local"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleSetMeetingDate} disabled={!meetingDate}>
                Confirmer
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Lien transcription */}
      {proc.status === "scheduled" && (
        <div className="border border-border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Mic className="w-4 h-4" />
            Réunion tenue ?
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update.mutate({ id: proc.id, status: "meeting" })}
          >
            Marquer la réunion comme tenue
          </Button>
        </div>
      )}

      {/* Génération IA */}
      {proc.status === "meeting" && proc.document_template_id && (
        <div className="border border-border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Document final
          </p>
          <p className="text-xs text-muted-foreground">
            Liez une transcription depuis le module Transcription, puis déclenchez la génération IA.
          </p>
        </div>
      )}
    </div>
  );
}
