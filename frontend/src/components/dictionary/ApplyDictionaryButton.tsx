import { useState } from "react";
import { BookOpen, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewSubstitutions, useApplyDictionary } from "@/api/hooks/useDictionary";

interface Props {
  targetType: "transcription" | "ai_document";
  targetId: string;
  /** Plain text to preview substitutions on (string or getter) */
  previewText: string | (() => string);
}

/** Extract diffs between original and substituted text, showing context around each change. */
function extractDiffs(original: string, substituted: string): { before: string; after: string }[] {
  const diffs: { before: string; after: string }[] = [];
  const CONTEXT = 30; // chars of context around each change

  // Simple word-level diff: split both into words, find differences
  const origWords = original.split(/(\s+)/);
  const subWords = substituted.split(/(\s+)/);

  let oi = 0;
  let si = 0;

  while (oi < origWords.length && si < subWords.length) {
    if (origWords[oi] === subWords[si]) {
      oi++;
      si++;
      continue;
    }

    // Found a difference - collect context
    // Get preceding context
    const precedingOrig = origWords.slice(Math.max(0, oi - 6), oi).join("");
    const precedingSub = subWords.slice(Math.max(0, si - 6), si).join("");

    // Find how many consecutive words differ
    let oEnd = oi;
    let sEnd = si;

    // Advance until we re-sync
    let synced = false;
    for (let look = 1; look <= 10 && !synced; look++) {
      // Try: original advanced by `look`, sub stays
      if (oi + look < origWords.length && origWords[oi + look] === subWords[si]) {
        oEnd = oi + look;
        sEnd = si;
        synced = true;
      }
      // Try: sub advanced by `look`, original stays
      if (si + look < subWords.length && origWords[oi] === subWords[si + look]) {
        oEnd = oi;
        sEnd = si + look;
        synced = true;
      }
      // Try: both advanced by `look`
      if (oi + look < origWords.length && si + look < subWords.length && origWords[oi + look] === subWords[si + look]) {
        oEnd = oi + look;
        sEnd = si + look;
        synced = true;
      }
    }

    if (!synced) {
      // Can't sync - show remaining as one big diff
      const changedOrig = origWords.slice(oi).join("");
      const changedSub = subWords.slice(si).join("");
      const trimOrig = (precedingOrig.length > CONTEXT ? "..." : "") + precedingOrig.slice(-CONTEXT) + changedOrig;
      const trimSub = (precedingSub.length > CONTEXT ? "..." : "") + precedingSub.slice(-CONTEXT) + changedSub;
      diffs.push({ before: trimOrig, after: trimSub });
      break;
    }

    const changedOrig = origWords.slice(oi, oEnd).join("");
    const changedSub = subWords.slice(si, sEnd).join("");
    const followingOrig = origWords.slice(oEnd, Math.min(origWords.length, oEnd + 6)).join("");
    const followingSub = subWords.slice(sEnd, Math.min(subWords.length, sEnd + 6)).join("");

    const beforeCtx = (precedingOrig.length > CONTEXT ? "..." : "") + precedingOrig.slice(-CONTEXT);
    const afterCtxOrig = followingOrig.slice(0, CONTEXT) + (followingOrig.length > CONTEXT ? "..." : "");
    const afterCtxSub = followingSub.slice(0, CONTEXT) + (followingSub.length > CONTEXT ? "..." : "");

    diffs.push({
      before: beforeCtx + changedOrig + afterCtxOrig,
      after: (precedingSub.length > CONTEXT ? "..." : "") + precedingSub.slice(-CONTEXT) + changedSub + afterCtxSub,
    });

    oi = oEnd;
    si = sEnd;
  }

  return diffs;
}

export function ApplyDictionaryButton({ targetType, targetId, previewText }: Props) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const preview = usePreviewSubstitutions();
  const apply = useApplyDictionary();

  async function handleOpen() {
    setApplied(false);
    setOpen(true);
    const text = typeof previewText === "function" ? previewText() : previewText;
    if (text.trim()) {
      await preview.mutateAsync(text);
    }
  }

  async function handleApply() {
    await apply.mutateAsync({ target_type: targetType, target_id: targetId });
    setApplied(true);
    setTimeout(() => {
      setOpen(false);
      setApplied(false);
    }, 1500);
  }

  const diffs = preview.data && preview.data.rules_applied > 0
    ? extractDiffs(preview.data.original_text, preview.data.substituted_text)
    : [];

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <BookOpen className="w-4 h-4" />
        Dictionnaire
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-lg">Appliquer le dictionnaire</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
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
                  {diffs.length > 0 ? (
                    <div className="space-y-2">
                      {diffs.map((d, i) => (
                        <div key={i} className="rounded-lg border border-border overflow-hidden text-sm">
                          <div className="bg-red-50 px-3 py-1.5 border-b border-border">
                            <span className="text-red-400 mr-1.5">-</span>
                            {d.before}
                          </div>
                          <div className="bg-green-50 px-3 py-1.5">
                            <span className="text-green-500 mr-1.5">+</span>
                            {d.after}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : preview.data.rules_applied === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucune regle du dictionnaire ne correspond au contenu actuel.
                    </p>
                  ) : null}
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
