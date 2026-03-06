import { useState } from "react";
import { CalendarDays, Mic, Sparkles, ChevronDown, ChevronUp, FileText, Loader2, Download, CheckCircle2, Circle, ArrowRight, Users, Mail, Upload, ClipboardList, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useProcedure, useUpdateProcedure, useGenerateConvocation, useStartWorkflow, useCompleteStep } from "@/api/hooks/useProcedures";
import { ParticipantManager } from "./ParticipantManager";
import type { ProcedureStatus, ProcedureStepInstance, StepType } from "@/api/types";

const STATUS_LABELS: Record<ProcedureStatus, string> = {
  draft:       "Brouillon",
  in_progress: "En cours",
  collecting:  "Collecte en cours",
  scheduled:   "Planifiée",
  meeting:     "Réunion tenue",
  generating:  "Génération IA",
  done:        "Terminée",
};

const STEP_TYPE_INFO: Record<StepType, { label: string; icon: typeof FileText }> = {
  form:              { label: "Formulaire", icon: FileText },
  select_contacts:   { label: "Sélection contacts", icon: Users },
  send_email:        { label: "Envoi email", icon: Mail },
  collect_responses: { label: "Collecte réponses", icon: ClipboardList },
  generate_document: { label: "Génération IA", icon: Sparkles },
  upload_document:   { label: "Upload document", icon: Upload },
  manual:            { label: "Validation", icon: CheckSquare },
};

interface Props {
  procedureId: string;
}

export function ProcedureDetail({ procedureId }: Props) {
  const { data: proc, isLoading } = useProcedure(procedureId);
  const update = useUpdateProcedure();
  const generateConvocation = useGenerateConvocation(procedureId);
  const startWorkflow = useStartWorkflow(procedureId);
  const completeStep = useCompleteStep(procedureId);
  const [meetingDate, setMeetingDate] = useState("");
  const [showResponses, setShowResponses] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function downloadConvocationPdf(docId: string) {
    setPdfLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/ai-documents/documents/${docId}/export?format=pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erreur téléchargement PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Convocation — ${proc?.title ?? "AG"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  }

  if (isLoading || !proc) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
      Chargement…
    </div>
  );

  const hasSteps = proc.steps && proc.steps.length > 0;

  if (hasSteps) {
    return <StepWorkflowView proc={proc} startWorkflow={startWorkflow} completeStep={completeStep} />;
  }

  // Legacy view
  return <LegacyProcedureView
    proc={proc}
    update={update}
    generateConvocation={generateConvocation}
    meetingDate={meetingDate}
    setMeetingDate={setMeetingDate}
    showResponses={showResponses}
    setShowResponses={setShowResponses}
    pdfLoading={pdfLoading}
    downloadConvocationPdf={downloadConvocationPdf}
  />;
}

// ── Step-based workflow view ────────────────────────────────────────────────

function StepWorkflowView({
  proc,
  startWorkflow,
  completeStep,
}: {
  proc: NonNullable<ReturnType<typeof useProcedure>["data"]>;
  startWorkflow: ReturnType<typeof useStartWorkflow>;
  completeStep: ReturnType<typeof useCompleteStep>;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({});

  const allDone = proc.steps.every((s) => s.status === "completed" || s.status === "skipped");
  const notStarted = proc.steps.every((s) => s.status === "pending");

  function handleCompleteStep(step: ProcedureStepInstance) {
    completeStep.mutate({ stepId: step.id, data: formData });
    setFormData({});
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-lg">{proc.title}</h3>
        {proc.description && (
          <p className="text-sm text-muted-foreground mt-1">{proc.description}</p>
        )}
        <Badge variant={allDone ? "default" : "secondary"} className="mt-2">
          {allDone ? "Terminé" : notStarted ? "Brouillon" : "En cours"}
        </Badge>
      </div>

      {/* Start button */}
      {notStarted && (
        <Button onClick={() => startWorkflow.mutate()} disabled={startWorkflow.isPending}>
          {startWorkflow.isPending ? (
            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Démarrage…</>
          ) : (
            <><ArrowRight className="w-4 h-4 mr-1" /> Démarrer le workflow</>
          )}
        </Button>
      )}

      {/* Step timeline */}
      <div className="space-y-1">
        {proc.steps.map((step, idx) => {
          const info = STEP_TYPE_INFO[step.step_type as StepType] ?? { label: step.step_type, icon: Circle };
          const Icon = info.icon;
          const isActive = step.status === "active";
          const isCompleted = step.status === "completed";

          return (
            <div key={step.id}>
              {/* Step header */}
              <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                isActive ? "bg-primary/5 border border-primary/20" :
                isCompleted ? "bg-muted/50" :
                "opacity-50"
              }`}>
                {/* Status icon */}
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : isActive ? (
                    <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/40" />
                  )}
                </div>

                {/* Step info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">{step.label}</span>
                    <Badge variant="outline" className="text-[10px]">{info.label}</Badge>
                  </div>
                  {step.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  )}

                  {/* Completed step data summary */}
                  {isCompleted && step.data && (
                    <div className="mt-2 text-xs text-muted-foreground bg-muted rounded p-2 space-y-0.5">
                      {Object.entries(step.data).map(([key, val]) => (
                        <p key={key}><span className="font-medium">{key}:</span> {String(val)}</p>
                      ))}
                    </div>
                  )}

                  {/* Active step form */}
                  {isActive && (
                    <div className="mt-3 space-y-3">
                      <StepActionForm
                        step={step}
                        formData={formData}
                        setFormData={setFormData}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleCompleteStep(step)}
                        disabled={completeStep.isPending}
                      >
                        {completeStep.isPending ? (
                          <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Traitement…</>
                        ) : (
                          <><CheckCircle2 className="w-3 h-3 mr-1" /> Valider cette étape</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Connector line */}
              {idx < proc.steps.length - 1 && (
                <div className="ml-[22px] w-px h-2 bg-border" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step action form (renders different UI per step type) ────────────────────

function StepActionForm({
  step,
  formData,
  setFormData,
}: {
  step: ProcedureStepInstance;
  formData: Record<string, string>;
  setFormData: (data: Record<string, string>) => void;
}) {
  const config = step.config || {};

  switch (step.step_type) {
    case "form": {
      const fields = (config.fields as { id: string; label: string; type: string; required: boolean }[]) || [];
      return (
        <div className="space-y-2">
          {fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <Label className="text-xs">{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  className="text-sm min-h-[60px]"
                  value={formData[field.id] ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, [field.id]: e.target.value })}
                />
              ) : field.type === "date" ? (
                <Input
                  type="date"
                  className="text-sm"
                  value={formData[field.id] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                />
              ) : (
                <Input
                  className="text-sm"
                  value={formData[field.id] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                />
              )}
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucun champ configuré pour ce formulaire.</p>
          )}
        </div>
      );
    }

    case "select_contacts":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Sélectionnez les contacts destinataires depuis votre carnet de contacts.
          </p>
          <Textarea
            className="text-sm min-h-[60px]"
            placeholder="Entrez les emails des destinataires (un par ligne)"
            value={formData.emails ?? ""}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, emails: e.target.value })}
          />
        </div>
      );

    case "send_email":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {(config.subject_template as string)
              ? `Objet : ${config.subject_template}`
              : "L'email sera envoyé aux contacts sélectionnés à l'étape précédente."}
          </p>
          <Input
            className="text-sm"
            placeholder="Notes ou commentaires (optionnel)"
            value={formData.notes ?? ""}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      );

    case "upload_document":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Uploadez le document requis.</p>
          <Input
            className="text-sm"
            placeholder="Nom ou référence du document"
            value={formData.document_ref ?? ""}
            onChange={(e) => setFormData({ ...formData, document_ref: e.target.value })}
          />
        </div>
      );

    case "manual":
      return (
        <div className="space-y-2">
          {(config.instructions as string) && (
            <p className="text-xs bg-muted rounded p-2">{config.instructions as string}</p>
          )}
          <Textarea
            className="text-sm min-h-[40px]"
            placeholder="Notes de validation (optionnel)"
            value={formData.validation_notes ?? ""}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, validation_notes: e.target.value })}
          />
        </div>
      );

    case "generate_document":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Un document IA sera généré automatiquement à partir des données collectées.
          </p>
        </div>
      );

    case "collect_responses":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Les formulaires ont été envoyés aux participants. Validez cette étape quand toutes les réponses sont collectées.
          </p>
        </div>
      );

    default:
      return <p className="text-xs text-muted-foreground">Type d'étape : {step.step_type}</p>;
  }
}

// ── Legacy procedure view (role-based) ──────────────────────────────────────

const LEGACY_STATUS_FLOW: ProcedureStatus[] = [
  "draft", "collecting", "scheduled", "meeting", "generating", "done",
];

function LegacyProcedureView({
  proc,
  update,
  generateConvocation,
  meetingDate,
  setMeetingDate,
  showResponses,
  setShowResponses,
  pdfLoading,
  downloadConvocationPdf,
}: {
  proc: NonNullable<ReturnType<typeof useProcedure>["data"]>;
  update: ReturnType<typeof useUpdateProcedure>;
  generateConvocation: ReturnType<typeof useGenerateConvocation>;
  meetingDate: string;
  setMeetingDate: (v: string) => void;
  showResponses: string | null;
  setShowResponses: (v: string | null) => void;
  pdfLoading: boolean;
  downloadConvocationPdf: (docId: string) => void;
}) {
  const currentIdx = LEGACY_STATUS_FLOW.indexOf(proc.status as ProcedureStatus);

  function handleSetMeetingDate() {
    if (!meetingDate) return;
    update.mutate({ id: proc.id, meeting_date: new Date(meetingDate).toISOString(), status: "scheduled" });
    setMeetingDate("");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-lg">{proc.title}</h3>
        {proc.description && (
          <p className="text-sm text-muted-foreground mt-1">{proc.description}</p>
        )}
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-1 flex-wrap">
        {LEGACY_STATUS_FLOW.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <Badge
              variant={i <= currentIdx ? "default" : "secondary"}
              className={`text-xs ${i < currentIdx ? "opacity-50" : ""}`}
            >
              {STATUS_LABELS[s]}
            </Badge>
            {i < LEGACY_STATUS_FLOW.length - 1 && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Participants */}
      <div className="border border-border rounded-lg p-4">
        <ParticipantManager procedure={proc} />
      </div>

      {/* Collected responses */}
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

      {/* Planning */}
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

      {/* Convocation */}
      {proc.status === "scheduled" && proc.document_template_id && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Convocation
          </p>
          {proc.ai_document_id ? (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">Convocation générée.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadConvocationPdf(proc.ai_document_id!)}
                disabled={pdfLoading}
              >
                {pdfLoading ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> PDF…</>
                ) : (
                  <><Download className="w-3 h-3 mr-1" /> Télécharger PDF</>
                )}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Génère la convocation à partir des points collectés.
              </p>
              <Button
                size="sm"
                onClick={() => generateConvocation.mutate()}
                disabled={generateConvocation.isPending}
              >
                {generateConvocation.isPending ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Génération…</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" /> Générer la convocation</>
                )}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Meeting held */}
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

      {/* PV generation */}
      {proc.status === "meeting" && proc.document_template_id && (
        <div className="border border-border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Document final (PV)
          </p>
          <p className="text-xs text-muted-foreground">
            Liez une transcription depuis le module Transcription, puis déclenchez la génération IA.
          </p>
        </div>
      )}
    </div>
  );
}
