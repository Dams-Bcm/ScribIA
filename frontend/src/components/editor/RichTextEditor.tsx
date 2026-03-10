import { useRef, useState } from "react";
import {
  EditorRoot,
  EditorContent,
  EditorBubble,
  EditorBubbleItem,
  EditorCommand,
  EditorCommandItem,
  EditorCommandEmpty,
  EditorCommandList,
  StarterKit,
  TiptapUnderline,
  type EditorInstance,
} from "novel";
import { marked } from "marked";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Save,
  Download,
  BookOpen,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplyDictionaryButton } from "@/components/dictionary/ApplyDictionaryButton";
import { useCreateRule } from "@/api/hooks/useDictionary";

interface Props {
  /** Contenu initial en Markdown */
  initialContent: string;
  /** Appelé quand l'utilisateur sauvegarde (contenu HTML) */
  onSave?: (html: string) => void;
  /** Appelé pour l'export */
  onExport?: (format: "pdf" | "docx") => void;
  /** Mode lecture seule */
  readOnly?: boolean;
  /** Dictionary apply config (shows "Appliquer le dictionnaire" button) */
  dictionary?: { targetType: "transcription" | "ai_document"; targetId: string };
}

const slashCommands = [
  { title: "Titre 1", description: "Titre principal", icon: Heading1, command: ({ editor }: { editor: EditorInstance }) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: "Titre 2", description: "Sous-titre", icon: Heading2, command: ({ editor }: { editor: EditorInstance }) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: "Titre 3", description: "Section", icon: Heading3, command: ({ editor }: { editor: EditorInstance }) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: "Liste", description: "Liste a puces", icon: List, command: ({ editor }: { editor: EditorInstance }) => editor.chain().focus().toggleBulletList().run() },
  { title: "Liste numerotee", description: "Liste ordonnee", icon: ListOrdered, command: ({ editor }: { editor: EditorInstance }) => editor.chain().focus().toggleOrderedList().run() },
  { title: "Citation", description: "Bloc de citation", icon: Quote, command: ({ editor }: { editor: EditorInstance }) => editor.chain().focus().toggleBlockquote().run() },
  { title: "Separateur", description: "Ligne horizontale", icon: Minus, command: ({ editor }: { editor: EditorInstance }) => editor.chain().focus().setHorizontalRule().run() },
];

export function RichTextEditor({ initialContent, onSave, onExport, readOnly = false, dictionary }: Props) {
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<EditorInstance | null>(null);
  const [dictPopover, setDictPopover] = useState<{ original: string; replacement: string } | null>(null);
  const createRule = useCreateRule();

  function handleSave() {
    if (!editorRef.current || !onSave) return;
    const html = editorRef.current.getHTML();
    onSave(html);
    setDirty(false);
  }

  // Convert markdown to HTML for initial load
  const initialHtml = marked.parse(initialContent, { async: false }) as string;

  const extensions = [
    StarterKit,
    TiptapUnderline,
  ];

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-1 flex-wrap">
          {onSave && (
            <Button size="sm" variant={dirty ? "default" : "outline"} onClick={handleSave}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {dirty ? "Sauvegarder *" : "Sauvegarde"}
            </Button>
          )}
          {onExport && (
            <>
              <Button size="sm" variant="outline" onClick={() => onExport("pdf")}>
                <Download className="w-3.5 h-3.5 mr-1" /> PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => onExport("docx")}>
                <Download className="w-3.5 h-3.5 mr-1" /> DOCX
              </Button>
            </>
          )}
          {dictionary && (
            <ApplyDictionaryButton
              targetType={dictionary.targetType}
              targetId={dictionary.targetId}
              previewText={() => editorRef.current?.getText() ?? ""}
            />
          )}
        </div>
      )}

      {/* Editor */}
      <EditorRoot>
        <EditorContent
          extensions={extensions}
          editable={!readOnly}
          onCreate={({ editor }) => {
            editorRef.current = editor;
            editor.commands.setContent(initialHtml);
          }}
          onUpdate={({ editor }) => {
            editorRef.current = editor;
            setDirty(true);
          }}
          className="border border-border rounded-lg bg-background min-h-[300px] max-h-[70vh] overflow-y-auto"
          editorProps={{
            attributes: {
              class: "prose prose-sm max-w-none p-4 focus:outline-none",
            },
          }}
        >
          {/* Bubble menu (selection) */}
          {!readOnly && (
            <EditorBubble className="flex items-center gap-0.5 rounded-lg border border-border bg-background shadow-md p-1">
              <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleBold().run()}>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <Bold className="w-3.5 h-3.5" />
                </Button>
              </EditorBubbleItem>
              <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleItalic().run()}>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <Italic className="w-3.5 h-3.5" />
                </Button>
              </EditorBubbleItem>
              <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleUnderline().run()}>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <Underline className="w-3.5 h-3.5" />
                </Button>
              </EditorBubbleItem>
              <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleStrike().run()}>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <Strikethrough className="w-3.5 h-3.5" />
                </Button>
              </EditorBubbleItem>
              {/* Separator + Dictionary quick-add */}
              <div className="w-px h-5 bg-border mx-0.5" />
              <EditorBubbleItem onSelect={(editor) => {
                const sel = editor.state.selection;
                const text = editor.state.doc.textBetween(sel.from, sel.to, " ");
                if (text.trim()) {
                  setDictPopover({ original: text.trim(), replacement: "" });
                }
              }}>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ajouter au dictionnaire">
                  <BookOpen className="w-3.5 h-3.5" />
                </Button>
              </EditorBubbleItem>
            </EditorBubble>
          )}

          {/* Slash command menu */}
          {!readOnly && (
            <EditorCommand className="z-50 w-64 rounded-lg border border-border bg-background shadow-md">
              <EditorCommandEmpty className="p-2 text-xs text-muted-foreground">
                Aucune commande
              </EditorCommandEmpty>
              <EditorCommandList>
                {slashCommands.map((item) => (
                  <EditorCommandItem
                    key={item.title}
                    value={item.title}
                    onCommand={item.command}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer"
                  >
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </EditorCommandItem>
                ))}
              </EditorCommandList>
            </EditorCommand>
          )}
        </EditorContent>
      </EditorRoot>

      {/* Dictionary quick-add popover */}
      {dictPopover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setDictPopover(null)}>
          <div className="bg-background rounded-xl border border-border shadow-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" /> Ajouter au dictionnaire
              </h4>
              <button onClick={() => setDictPopover(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!dictPopover.replacement.trim()) return;
              await createRule.mutateAsync({
                original: dictPopover.original,
                replacement: dictPopover.replacement,
              });
              setDictPopover(null);
            }}>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">Mot original</label>
                  <input
                    type="text"
                    className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-muted/30 mt-0.5"
                    value={dictPopover.original}
                    onChange={(e) => setDictPopover({ ...dictPopover, original: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Remplacement</label>
                  <input
                    type="text"
                    className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background mt-0.5"
                    value={dictPopover.replacement}
                    onChange={(e) => setDictPopover({ ...dictPopover, replacement: e.target.value })}
                    autoFocus
                    placeholder="Saisir le remplacement..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button type="submit" size="sm" disabled={createRule.isPending || !dictPopover.replacement.trim()}>
                  Ajouter
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setDictPopover(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
