import React, { useState } from "react";
import { useParams } from "react-router";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { usePublicForm, useSubmitForm } from "@/api/hooks/useProcedures";
import type { FormQuestion } from "@/api/types";

export function FormPage() {
  const { token } = useParams<{ token: string }>();
  const { data: form, isLoading, error } = usePublicForm(token ?? "");
  const submit = useSubmitForm(token ?? "");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function setResponse(id: string, value: string) {
    setResponses((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit.mutateAsync(responses);
    setSubmitted(true);
  }

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (error || !form) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p className="font-medium">Formulaire introuvable</p>
          <p className="text-sm text-muted-foreground">
            Ce lien est invalide ou a expiré.
          </p>
        </div>
      </PageShell>
    );
  }

  if (submitted || form.already_responded) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <p className="font-semibold text-lg">Réponses enregistrées</p>
          <p className="text-sm text-muted-foreground">
            Merci {form.participant_name}, vos réponses ont bien été transmises.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="border-b border-border pb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Formulaire de contribution
          </p>
          <h1 className="text-xl font-bold">{form.procedure_title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {form.participant_name} — <span className="font-medium">{form.role_name}</span>
          </p>
        </div>

        {form.form_questions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucune question pour ce formulaire.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {form.form_questions.map((q: FormQuestion) => (
              <div key={q.id} className="space-y-1.5">
                <Label htmlFor={q.id}>
                  {q.label}
                  {q.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {q.type === "textarea" ? (
                  <Textarea
                    id={q.id}
                    value={responses[q.id] ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setResponse(q.id, e.target.value)}
                    rows={4}
                    required={q.required}
                    placeholder="Votre réponse…"
                  />
                ) : (
                  <Input
                    id={q.id}
                    value={responses[q.id] ?? ""}
                    onChange={(e) => setResponse(q.id, e.target.value)}
                    required={q.required}
                    placeholder="Votre réponse…"
                  />
                )}
              </div>
            ))}

            <Button type="submit" className="w-full" disabled={submit.isPending}>
              {submit.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi…</>
              ) : (
                "Envoyer mes réponses"
              )}
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border px-6 py-4 flex items-center gap-3">
        <span className="font-bold text-lg">Scrib'IA</span>
        <span className="text-muted-foreground text-sm">· Formulaire de contribution</span>
      </div>
      <div className="px-6 py-8">
        {children}
      </div>
    </div>
  );
}
