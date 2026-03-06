import { useState } from "react";
import { BookOpen, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewSubstitutions, useApplyDictionary } from "@/api/hooks/useDictionary";

interface Props {
  targetType: "transcription" | "ai_document";
  targetId: string;
  /** Plain text to preview substitutions on */
  previewText: string;
}

export function ApplyDictionaryButton({ targetType, targetId, previewText }: Props) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const preview = usePreviewSubstitutions();
  const apply = useApplyDictionary();

  async function handleOpen() {
    setApplied(false);
    setOpen(true);
    if (previewText.trim()) {
      await preview.mutateAsync(previewText);
    }
  }

  async function handleApply() {
    const result = await apply.mutateAsync({ target_type: targetType, target_id: targetId });
    if (result.rules_applied > 0) {
      setApplied(true);
      setTimeout(() => {
        setOpen(false);
        setApplied(false);
      }, 1500);
    } else {
      setApplied(true);
      setTimeout(() => {
        setOpen(false);
        setApplied(false);
      }, 2000);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <BookOpen className="w-4 h-4" />
        Dictionnaire
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-lg">Appliquer le dictionnaire</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
              {preview.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Calcul de l'apercu...
                </div>
              )}

              {preview.data && (
                <>
                  <p className="text-sm">
                    <strong>{preview.data.rules_applied}</strong> regle(s) seront appliquee(s)
                  </p>
                  {preview.data.rules_applied > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Avant :</p>
                        <div className="bg-red-50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto border border-red-100">
                          {preview.data.original_text}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Apres :</p>
                        <div className="bg-green-50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto border border-green-100">
                          {preview.data.substituted_text}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucune regle du dictionnaire ne correspond au contenu actuel.
                    </p>
                  )}
                </>
              )}

              {preview.isError && (
                <p className="text-sm text-red-600">
                  Erreur lors du calcul de l'apercu. Verifiez que le module dictionnaire est actif.
                </p>
              )}

              {applied && apply.data && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg p-3">
                  <Check className="w-4 h-4" />
                  {apply.data.rules_applied > 0
                    ? `${apply.data.rules_applied} regle(s) appliquee(s) avec succes !`
                    : "Aucune substitution a appliquer."}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleApply}
                disabled={apply.isPending || applied || !preview.data || preview.data.rules_applied === 0}
              >
                {apply.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Application...
                  </>
                ) : applied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Applique !
                  </>
                ) : (
                  "Appliquer"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
