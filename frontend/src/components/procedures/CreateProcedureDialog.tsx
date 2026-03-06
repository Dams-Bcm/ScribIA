import { useState } from "react";
import { ClipboardList, CheckCircle2, ChevronLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useProcedureTemplates, useCreateProcedure } from "@/api/hooks/useProcedures";
import type { Procedure, ProcedureTemplate } from "@/api/types";

interface Props {
  onCreated: (proc: Procedure) => void;
}

function autoTitle(templateName: string): string {
  const now = new Date();
  const month = now.toLocaleDateString("fr-FR", { month: "long" });
  const year = now.getFullYear();
  return `${templateName} — ${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
}

export function CreateProcedureDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [selected, setSelected] = useState<ProcedureTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);

  const { data: procTemplates = [] } = useProcedureTemplates();
  const create = useCreateProcedure();

  const activeTemplates = procTemplates.filter((t) => t.is_active);

  function handlePickTemplate(tpl: ProcedureTemplate) {
    setSelected(tpl);
    setTitle(autoTitle(tpl.name));
    setEditingTitle(false);
    setStep("confirm");
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setStep("pick");
      setSelected(null);
      setTitle("");
      setEditingTitle(false);
    }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    const proc = await create.mutateAsync({
      title: title.trim(),
      description: null,
      template_id: selected?.id ?? null,
      document_template_id: selected?.document_template_id ?? null,
    });
    onCreated(proc);
    handleOpenChange(false);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ClipboardList className="w-4 h-4 mr-2" />
        Nouvelle procédure
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {step === "pick" ? "Quel type de procédure ?" : "Confirmer"}
            </DialogTitle>
          </DialogHeader>

          {step === "pick" && (
            <div className="space-y-3">
              {activeTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Aucun template disponible. Créez-en un dans l'onglet Templates.
                </p>
              ) : (
                <div className="grid gap-2">
                  {activeTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => handlePickTemplate(tpl)}
                      className="flex items-start gap-3 w-full text-left rounded-lg border border-border p-3 hover:bg-accent hover:border-primary transition-colors"
                    >
                      <ClipboardList className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{tpl.name}</p>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                        )}
                        {tpl.steps && tpl.steps.length > 0 ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            {tpl.steps.length} étape(s) : {tpl.steps.map((s) => s.label).join(" → ")}
                          </p>
                        ) : tpl.roles.length > 0 ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            {tpl.roles.map((r) => r.role_name).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-1">
                <button
                  onClick={() => {
                    setSelected(null);
                    setTitle("");
                    setStep("confirm");
                  }}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Créer sans template
                </button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              {selected && (
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">{selected.name}</span>
                </div>
              )}

              <div className="space-y-1">
                {editingTitle ? (
                  <Input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium flex-1">{title || "Sans titre"}</p>
                    <button
                      onClick={() => setEditingTitle(true)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Modifier le titre"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Cliquez sur le crayon pour personnaliser le titre
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step === "confirm" && (
              <Button variant="ghost" size="sm" onClick={() => setStep("pick")} className="mr-auto">
                <ChevronLeft className="w-4 h-4 mr-1" /> Retour
              </Button>
            )}
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Annuler</Button>
            {step === "confirm" && (
              <Button onClick={handleCreate} disabled={!title.trim() || create.isPending}>
                {create.isPending ? "Création…" : "Créer"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
