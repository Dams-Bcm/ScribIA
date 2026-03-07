import { useState, useEffect } from "react";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useActiveAnnouncement } from "@/api/hooks/useAnnouncements";

export function AnnouncementPopup() {
  const { data: announcement } = useActiveAnnouncement();
  const [dismissed, setDismissed] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (announcement) {
      const stored = localStorage.getItem("dismissed_announcement");
      if (stored === announcement.id) {
        setDismissed(true);
      }
    }
  }, [announcement]);

  if (!announcement || dismissed) return null;

  function handleDismiss() {
    if (dontShow && announcement) {
      localStorage.setItem("dismissed_announcement", announcement.id);
    }
    setDismissed(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-lg flex-1">{announcement.title}</h3>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{announcement.message}</p>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={dontShow}
              onCheckedChange={(checked) => setDontShow(!!checked)}
            />
            <span className="text-xs text-muted-foreground">Ne plus afficher</span>
          </label>
          <Button size="sm" onClick={handleDismiss}>
            Compris
          </Button>
        </div>
      </div>
    </div>
  );
}
