import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { askPaperChat, getIngestionStatus, ingestPaper } from "@/lib/rag.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Sparkles, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string; sources?: any[] };

export function PaperChat({ topicId }: { topicId: string }) {
  const ask = useServerFn(askPaperChat);
  const status = useServerFn(getIngestionStatus);
  const ingest = useServerFn(ingestPaper);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const statusQ = useQuery({
    queryKey: ["ingest-status", topicId],
    queryFn: () => status({ data: { topic_id: topicId } }),
    refetchInterval: 4000,
  });

  const ingestM = useMutation({
    mutationFn: (paper_id: string) => ingest({ data: { paper_id } }),
    onSuccess: () => statusQ.refetch(),
    onError: (e: Error) => toast.error(e.message),
  });

  const askM = useMutation({
    mutationFn: (q: string) =>
      ask({
        data: {
          topic_id: topicId,
          question: q,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        },
      }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources }]);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, askM.isPending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = () => {
    const q = input.trim();
    if (!q || askM.isPending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    askM.mutate(q);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const allReady = (statusQ.data ?? []).length > 0 && (statusQ.data ?? []).every((p) => p.ingested);
  const pendingPapers = (statusQ.data ?? []).filter((p) => !p.ingested);

  return (
    <div className="flex flex-col h-[600px]">
      {/* Ingestion status */}
      <div className="border-b border-border pb-3 mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {allReady ? (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> All {statusQ.data?.length} papers indexed for chat
              </span>
            ) : (
              <span>
                {pendingPapers.length} paper{pendingPapers.length === 1 ? "" : "s"} not yet indexed
              </span>
            )}
          </div>
          {pendingPapers.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={ingestM.isPending}
              onClick={async () => {
                let successCount = 0;
                let failCount = 0;
                for (const p of pendingPapers) {
                  try {
                    await ingestM.mutateAsync(p.paper_id);
                    successCount++;
                  } catch (e: any) {
                    failCount++;
                    console.error(`Failed to index ${p.file_name}:`, e);
                    toast.error(`Failed to index ${p.file_name}: ${e.message || e}`);
                  }
                }
                if (successCount > 0) {
                  toast.success(`Indexing completed: ${successCount} paper(s) indexed.`);
                }
                if (failCount > 0) {
                  toast.error(`${failCount} paper(s) failed to index.`);
                }
              }}
            >
              {ingestM.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Index now
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Ask questions about your uploaded papers.</p>
            <p className="text-xs mt-1">e.g. "What datasets do these papers use?"</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-lg bg-ink text-primary-foreground px-4 py-2.5 text-sm"
                  : "max-w-[90%] rounded-lg bg-secondary/50 border border-border px-4 py-3 text-sm"
              }
            >
              <p className="whitespace-pre-line leading-relaxed">{m.content}</p>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sources</div>
                  {m.sources.map((s) => (
                    <div key={s.index} className="text-xs">
                      <Badge variant="outline" className="mr-1.5 text-[10px]">[{s.index}]</Badge>
                      <span className="text-muted-foreground">{s.file_name}</span>
                      <span className="text-muted-foreground/60"> · {Math.round(s.similarity * 100)}% match</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {askM.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Searching papers…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border pt-3 mt-3">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={allReady ? "Ask about the papers…" : "Index papers first to enable chat"}
            disabled={!allReady || askM.isPending}
            rows={2}
            className="resize-none"
          />
          <Button onClick={send} disabled={!input.trim() || !allReady || askM.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
