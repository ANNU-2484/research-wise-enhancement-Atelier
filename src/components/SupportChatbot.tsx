import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  HelpCircle,
  Home,
  X,
  Search,
  BookOpen,
  ChevronRight,
  Send,
  Loader2,
  ChevronDown,
  ArrowLeft
} from "lucide-react";
import { SUPPORT_ARTICLES, SupportArticle } from "@/lib/support-articles";
import { askSupportChat } from "@/lib/support.functions";
import { toast } from "sonner";

type Message = {
  role: "user" | "assistant";
  content: string;
};

// Simple Markdown parser for rendering chat response safely without external libs
function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  let inList = false;
  let inNumList = false;

  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Bullet point
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          inList = true;
          inNumList = false;
          const text = trimmed.substring(2);
          return (
            <ul key={idx} className="list-disc pl-5 my-0.5 space-y-1">
              <li className="text-muted-foreground/90">{parseBold(text)}</li>
            </ul>
          );
        }

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
        if (numMatch) {
          inList = false;
          inNumList = true;
          const text = numMatch[2];
          return (
            <ol key={idx} className="list-decimal pl-5 my-0.5 space-y-1" start={parseInt(numMatch[1])}>
              <li className="text-muted-foreground/90">{parseBold(text)}</li>
            </ol>
          );
        }

        // Empty line
        if (!trimmed) {
          inList = false;
          inNumList = false;
          return <div key={idx} className="h-1.5" />;
        }

        // Standard paragraph
        return (
          <p key={idx} className="text-muted-foreground/90">
            {parseBold(line)}
          </p>
        );
      })}
    </div>
  );
}

function parseBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function SupportChatbot() {
  const askSupport = useServerFn(askSupportChat);

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "help" | "messages">("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<SupportArticle | null>(null);

  // Chat state
  const [input, setInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("atelier_support_chat");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (_) {}
      }
    }
    return [
      {
        role: "assistant",
        content:
          "Hi there! 👋 I am the Atelier Support Assistant. How can I help you compile research documents, manage agents, or upload papers today?",
      },
    ];
  });
  const [isPending, setIsPending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Save chat history
  useEffect(() => {
    localStorage.setItem("atelier_support_chat", JSON.stringify(chatHistory));
  }, [chatHistory]);

  // Scroll to bottom when history or pending state updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chatHistory, isPending]);

  // Focus input when tab switches to messages or panel opens
  useEffect(() => {
    if (isOpen && activeTab === "messages") {
      setTimeout(() => chatInputRef.current?.focus(), 150);
    }
  }, [isOpen, activeTab]);

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend ?? input).trim();
    if (!q || isPending) return;

    if (!textToSend) {
      setInput("");
    }

    const newMessages: Message[] = [...chatHistory, { role: "user", content: q }];
    setChatHistory(newMessages);
    setIsPending(true);

    try {
      const res = await askSupport({
        data: {
          question: q,
          history: chatHistory.slice(-8), // Send last 8 messages for context
        },
      });
      setChatHistory((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to contact Support Assistant");
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I ran into an error. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsPending(false);
    }
  };

  const handleFAQClick = (article: SupportArticle) => {
    setActiveTab("messages");
    handleSend(`Can you tell me about: ${article.title}?`);
  };

  // Filter support articles based on search query
  const filteredArticles = SUPPORT_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 border border-border/20 group cursor-pointer"
        aria-label="Toggle support assistant"
      >
        {isOpen ? (
          <ChevronDown className="h-6 w-6 animate-in fade-in zoom-in duration-200" />
        ) : (
          <div className="relative">
            <MessageSquare className="h-6 w-6 animate-in fade-in zoom-in duration-200 text-primary-foreground" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold"></span>
            </span>
          </div>
        )}
      </button>

      {/* Support Chat Drawer Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[580px] w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-paper shadow-paper overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">
          {/* Header */}
          <header className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-primary-foreground shadow-paper">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <h3 className="font-serif text-sm font-semibold tracking-tight text-foreground">
                  Atelier
                </h3>
                <span className="text-[8px] uppercase tracking-[0.18em] text-muted-foreground block">
                  Support & Assistant
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted/50 cursor-pointer"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          {/* Drawer Body Container */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-background/30">
            {/* 1. HOME TAB */}
            {activeTab === "home" && (
              <div className="flex-1 flex flex-col p-5 overflow-y-auto space-y-5">
                <div className="pt-2">
                  <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground leading-tight">
                    Hi there
                  </h1>
                  <h2 className="font-serif text-2xl font-light text-muted-foreground tracking-tight leading-tight mt-0.5">
                    How can we help?
                  </h2>
                </div>

                {/* Help Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for help"
                    className="pl-9 pr-4 py-5 bg-card border-border hover:border-gold/50 focus-visible:ring-gold"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Search Results / Default View */}
                <div className="space-y-3">
                  {searchQuery ? (
                    <>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                        Search Results ({filteredArticles.length})
                      </div>
                      {filteredArticles.length > 0 ? (
                        <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-card overflow-hidden">
                          {filteredArticles.map((article) => (
                            <button
                              key={article.id}
                              onClick={() => {
                                setSelectedArticle(article);
                                setActiveTab("help");
                              }}
                              className="w-full text-left p-3.5 hover:bg-secondary/40 transition-colors flex items-center justify-between gap-3 text-sm group cursor-pointer"
                            >
                              <span className="font-serif font-medium text-foreground group-hover:text-primary transition-colors">
                                {article.title}
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-sm text-muted-foreground">
                          No matching help articles found. Try another search or ask the assistant!
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                        Suggested FAQs
                      </div>
                      <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-card overflow-hidden">
                        {SUPPORT_ARTICLES.slice(0, 4).map((article) => (
                          <button
                            key={article.id}
                            onClick={() => {
                              setSelectedArticle(article);
                              setActiveTab("help");
                            }}
                            className="w-full text-left p-3.5 hover:bg-secondary/40 transition-colors flex items-center justify-between gap-3 text-sm group cursor-pointer"
                          >
                            <span className="font-serif font-medium text-foreground group-hover:text-primary transition-colors">
                              {article.title}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                          </button>
                        ))}
                      </div>

                      {/* Contact Assistant CTA */}
                      <button
                        onClick={() => setActiveTab("messages")}
                        className="w-full bg-ink text-primary-foreground hover:bg-ink/90 p-4 rounded-xl shadow-paper flex items-center justify-between gap-3 text-sm transition font-medium group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <MessageSquare className="h-4 w-4 text-gold" />
                          <span>Chat with Atelier Assistant</span>
                        </div>
                        <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 2. HELP TAB */}
            {activeTab === "help" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedArticle ? (
                  // Article Viewer
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="border-b border-border bg-card/50 px-4 py-2.5 flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedArticle(null)}
                        className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to help
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-[10px] text-primary">
                          {selectedArticle.category}
                        </Badge>
                        <h2 className="font-serif text-xl font-semibold leading-snug text-foreground">
                          {selectedArticle.title}
                        </h2>
                      </div>
                      <div className="h-[1px] bg-border/60" />
                      <div className="text-sm leading-relaxed text-muted-foreground space-y-3 whitespace-pre-wrap font-sans">
                        {selectedArticle.content}
                      </div>

                      <div className="h-[1px] bg-border/60 mt-6" />
                      <div className="pt-2 flex flex-col gap-2">
                        <span className="text-[11px] text-muted-foreground font-semibold">
                          Still need help?
                        </span>
                        <Button
                          size="sm"
                          className="w-full gap-2 cursor-pointer"
                          onClick={() => handleFAQClick(selectedArticle)}
                        >
                          <MessageSquare className="h-4 w-4" /> Ask about this article
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Support Articles List
                  <div className="flex-1 flex flex-col p-5 overflow-y-auto space-y-4">
                    <div className="pt-2 mb-2">
                      <h2 className="font-serif text-2xl text-foreground">Help Guides</h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        Browse our articles on how to set up research projects and configure agents.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {["Getting Started", "Agent Info", "Workspace", "Export", "Troubleshooting"].map(
                        (cat) => {
                          const articles = SUPPORT_ARTICLES.filter((a) => a.category === cat);
                          if (articles.length === 0) return null;

                          return (
                            <div key={cat} className="space-y-2">
                              <span className="text-[10px] uppercase tracking-[0.15em] text-primary/80 font-bold block pl-1">
                                {cat}
                              </span>
                              <div className="rounded-lg border border-border bg-card overflow-hidden">
                                {articles.map((art) => (
                                  <button
                                    key={art.id}
                                    onClick={() => setSelectedArticle(art)}
                                    className="w-full text-left p-3 hover:bg-secondary/40 transition-colors flex items-center justify-between text-sm group cursor-pointer border-b border-border/40 last:border-b-0"
                                  >
                                    <span className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                      {art.title}
                                    </span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. MESSAGES TAB */}
            {activeTab === "messages" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Chat Message Logs */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-5 space-y-4 bg-background/20"
                >
                  {chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-paper ${
                          msg.role === "user"
                            ? "bg-ink text-primary-foreground rounded-tr-none"
                            : "bg-card border border-border rounded-tl-none"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <SafeMarkdown content={msg.content} />
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed text-sm">
                            {msg.content}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {isPending && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-card border border-border px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground shadow-paper">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Atelier Assistant is typing…
                      </div>
                    </div>
                  )}
                </div>

                {/* composer input */}
                <div className="p-3 border-t border-border bg-card">
                  <div className="flex gap-2 items-end">
                    <Textarea
                      ref={chatInputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Ask the Atelier Assistant…"
                      rows={1}
                      className="resize-none min-h-[40px] max-h-[120px] bg-background border-border focus-visible:ring-gold py-2.5"
                      disabled={isPending}
                    />
                    <Button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || isPending}
                      size="icon"
                      className="h-10 w-10 shrink-0 cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Bar matching Elicit design */}
          <nav className="flex items-center justify-around border-t border-border bg-card py-2 px-6">
            <button
              onClick={() => {
                setActiveTab("home");
                setSelectedArticle(null);
              }}
              className={`flex flex-col items-center gap-1 py-1 cursor-pointer transition ${
                activeTab === "home" ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Home className="h-5 w-5" />
              <span className="text-[10px]">Home</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("help");
                setSelectedArticle(null);
              }}
              className={`flex flex-col items-center gap-1 py-1 cursor-pointer transition ${
                activeTab === "help" ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <HelpCircle className="h-5 w-5" />
              <span className="text-[10px]">Help</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("messages");
                setSelectedArticle(null);
              }}
              className={`flex flex-col items-center gap-1 py-1 cursor-pointer transition ${
                activeTab === "messages" ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-5 w-5" />
              <span className="text-[10px]">Messages</span>
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
