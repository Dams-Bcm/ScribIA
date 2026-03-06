import { useState, useRef, useEffect } from "react";
import { Search, Send, Loader2, FileText, Mic, ClipboardList, RefreshCw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleGuard } from "@/components/ModuleGuard";
import { useAuth } from "@/stores/auth";
import { useAskQuestion, useReindex } from "@/api/hooks/useSearch";
import type { SearchSource } from "@/api/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchSource[];
  chunks_used?: number;
}

const SOURCE_ICONS: Record<string, React.ElementType> = {
  ai_document: FileText,
  transcription: Mic,
  procedure: ClipboardList,
};

const SOURCE_LABELS: Record<string, string> = {
  ai_document: "Document IA",
  transcription: "Transcription",
  procedure: "Procédure",
};

const FILTER_OPTIONS = [
  { value: "all", label: "Toutes les sources" },
  { value: "ai_document", label: "Documents IA" },
  { value: "transcription", label: "Transcriptions" },
  { value: "procedure", label: "Procédures" },
];

export function SearchPage() {
  return (
    <ModuleGuard module="search" label="Recherche intelligente">
      <SearchChat />
    </ModuleGuard>
  );
}

function SearchChat() {
  const { isAdmin } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const ask = useAskQuestion();
  const reindex = useReindex();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || ask.isPending) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const result = await ask.mutateAsync({
        question,
        source_filter: sourceFilter === "all" ? null : sourceFilter,
      });
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        sources: result.sources,
        chunks_used: result.chunks_used,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Désolé, une erreur est survenue. Veuillez réessayer.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Search className="w-5 h-5" />
            Recherche intelligente
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Posez vos questions sur vos documents, transcriptions et procédures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reindex.mutate()}
              disabled={reindex.isPending}
            >
              {reindex.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
              )}
              Réindexer
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Search className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-sm">
              Posez une question pour rechercher dans vos données
            </p>
            <div className="mt-4 space-y-1">
              {[
                "Qui était présent lors de la dernière AG ?",
                "Quelles décisions ont été prises concernant les travaux ?",
                "Résume la dernière réunion du conseil",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="block text-xs text-primary/70 hover:text-primary underline underline-offset-2"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
                  <p className="text-xs font-medium opacity-70">
                    Sources ({msg.chunks_used} extraits) :
                  </p>
                  {msg.sources.map((src, i) => {
                    const Icon = SOURCE_ICONS[src.type] ?? FileText;
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs opacity-80">
                        <Icon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{src.title}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto flex-shrink-0">
                          {SOURCE_LABELS[src.type] ?? src.type}
                        </Badge>
                        <span className="text-[10px] opacity-60 flex-shrink-0">
                          {Math.round(src.relevance * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {ask.isPending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Recherche en cours...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-2 border-t border-border">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Posez votre question..."
          className="flex-1"
          disabled={ask.isPending}
          autoFocus
        />
        <Button type="submit" disabled={!input.trim() || ask.isPending}>
          {ask.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </form>

      {/* Reindex result */}
      {reindex.isSuccess && reindex.data && (
        <p className="text-xs text-muted-foreground mt-1">
          Réindexation terminée : {reindex.data.chunks_total} chunks
          ({reindex.data.ai_documents} docs, {reindex.data.transcriptions} transcriptions, {reindex.data.procedures} procédures)
        </p>
      )}
    </div>
  );
}
