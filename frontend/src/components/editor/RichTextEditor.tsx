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
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Contenu initial en Markdown */
  initialContent: string;
  /** Appelé quand l'utilisateur sauvegarde (contenu HTML) */
  onSave?: (html: string) => void;
  /** Appelé pour l'export */
  onExport?: (format: "pdf" | "docx") => void;
  /** Mode lecture seule */
  readOnly?: boolean;
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

export function RichTextEditor({ initialContent, onSave, onExport, readOnly = false }: Props) {
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<EditorInstance | null>(null);

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
    </div>
  );
}
