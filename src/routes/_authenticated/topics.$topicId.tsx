import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Upload, FileText, Trash2, Play, CheckCircle2, AlertCircle, Loader2,
  Sparkles, BookOpen, Quote, Search, FlaskConical, ScrollText, Download, MessageSquare,
  ShieldCheck, Columns3, Lightbulb, Map as MapIcon, ExternalLink, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTopic, registerPaper, deletePaper } from "@/lib/topics.functions";
import { runAgent, runAllAgents, type PaperRelevanceItem } from "@/lib/agents.functions";
import { ingestPaper } from "@/lib/rag.functions";
import { exportReportDocx, exportReportPdf } from "@/lib/report-export";
import { PaperChat } from "@/components/PaperChat";
import type { RecommendedAcademicPaper } from "@/lib/academic-search.server";

export const Route = createFileRoute("/_authenticated/topics/$topicId")({
  loader: async ({ params }) => {
    try {
      const data = await getTopic({ data: { id: params.topicId } });
      return { topicTitle: data.topic.title as string };
    } catch {
      return { topicTitle: "" };
    }
  },
  head: ({ params, loaderData }) => {
    const title = loaderData?.topicTitle
      ? `${loaderData.topicTitle} · Atelier`
      : "Research topic · Atelier";
    const desc = loaderData?.topicTitle
      ? `Multi-agent research workspace for "${loaderData.topicTitle}" — literature review, citations, gap analysis and methodology.`
      : "Run multi-agent research analysis on uploaded papers in your Atelier workspace.";
    const url = `https://cozy-connect-73.lovable.app/topics/${params.topicId}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { name: "robots", content: "noindex" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: TopicPage,
});

type AgentKey =
  | "literature" | "citation" | "gap" | "methodology"
  | "evidence" | "comparison" | "novelty" | "roadmap" | "report";

const AGENTS: { key: AgentKey; title: string; description: string; icon: any }[] = [
  { key: "literature", title: "Literature Review", description: "Reads PDFs, extracts summaries, keywords, objectives, findings & limitations.", icon: BookOpen },
  { key: "citation",   title: "Citation",          description: "Generates APA, IEEE and BibTeX entries from the literature.", icon: Quote },
  { key: "gap",        title: "Research Gap",      description: "Compares papers and identifies unexplored areas & novelty.", icon: Search },
  { key: "evidence",   title: "Evidence Verification", description: "Grounds each key claim in a paper, page and supporting snippet.", icon: ShieldCheck },
  { key: "comparison", title: "Paper Comparison",  description: "Builds a side-by-side comparison matrix across all uploaded papers.", icon: Columns3 },
  { key: "methodology",title: "Methodology",       description: "Recommends algorithms, datasets, tools and evaluation metrics.", icon: FlaskConical },
  { key: "novelty",    title: "Research Novelty",  description: "AI-assisted assessment of how novel a new research direction would be.", icon: Lightbulb },
  { key: "roadmap",    title: "Research Roadmap",  description: "Generates a phased roadmap from literature review to paper writing.", icon: MapIcon },
  { key: "report",     title: "Report Generator",  description: "Compiles every output into a publishable research report.", icon: ScrollText },
];

function ConfidencePill({ c }: { c: any }) {
  if (!c || typeof c.score !== "number") return null;
  const level = (c.level ?? "").toLowerCase();
  const color =
    level === "high" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : level === "medium" ? "bg-amber-100 text-amber-900 border-amber-300"
    : "bg-rose-100 text-rose-800 border-rose-300";
  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-xs ${color}`}>
      <div className="flex items-center gap-2 font-medium">
        <span>Confidence: {c.score}%</span>
        <span className="uppercase tracking-wider">{c.level}</span>
      </div>
      {c.rationale && <div className="mt-1 opacity-80">{c.rationale}</div>}
    </div>
  );
}

function getVerificationBadge(statusRaw?: string, verified?: boolean) {
  const status = (statusRaw || (verified ? "Verified" : "Not Supported")).toLowerCase().trim();
  if (status.includes("partially") || status === "partial") {
    return (
      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-900 border-amber-300">
        Partially Supported
      </Badge>
    );
  }
  if (status.includes("insufficient") || status.includes("no evidence")) {
    return (
      <Badge variant="outline" className="text-[10px] bg-secondary text-muted-foreground border-border">
        Insufficient Evidence
      </Badge>
    );
  }
  if (status.includes("not supported") || status.includes("contradicted") || status === "unverified" || verified === false) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        Not Supported
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
      Verified / Supported
    </Badge>
  );
}

function RelevanceCheckSection({ relevanceCheck }: { relevanceCheck?: PaperRelevanceItem[] }) {
  if (!relevanceCheck || relevanceCheck.length === 0) return null;

  const notRelated = relevanceCheck.filter((r) => r.status === "not_related");
  const related = relevanceCheck.filter((r) => r.status === "related");
  const isZeroRelatedFallback = related.length === 0 && notRelated.length > 0;

  return (
    <div className="mb-6 rounded-lg border border-border bg-card/70 p-4 shadow-sm min-w-0">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border flex-wrap gap-2">
        <h4 className="font-serif text-base text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Uploaded Paper Relevance Check
        </h4>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
            {related.length} Relevant
          </Badge>
          {notRelated.length > 0 && (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">
              {notRelated.length} Out of Topic
            </Badge>
          )}
        </div>
      </div>

      {isZeroRelatedFallback && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-950">
          <div className="flex items-center gap-2 font-serif text-sm font-semibold text-amber-950 mb-1">
            <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0" />
            NO RELEVANT PAPER FOUND
          </div>
          <p className="leading-relaxed text-amber-900">
            None of the uploaded papers satisfied the required relevance criteria of a meaningful topic/domain connection and at least two distinct meaningful research-related supporting points.
          </p>
        </div>
      )}

      {notRelated.length > 0 && (
        <div className="mb-4 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-rose-600 font-semibold mb-2">
            Not Related / Out of Topic {isZeroRelatedFallback ? "(Evaluated Status)" : "(Excluded from Processing)"}
          </p>
          <div className="space-y-2 min-w-0">
            {notRelated.map((item, idx) => {
              const isFallbackSource = isZeroRelatedFallback && idx === 0;
              return (
                <div key={idx} className="rounded-md border border-rose-200 bg-rose-50/50 p-3 text-xs min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="font-medium text-foreground break-words">
                      "{item.title || item.file_name}"
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isFallbackSource ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-900 border-amber-300 font-medium">
                          Fallback Paper — Not Classified as Relevant
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          Not Related / Out of Topic
                        </Badge>
                      )}
                    </div>
                  </div>
                  {item.file_name && item.file_name !== item.title && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 break-words">File: {item.file_name}</div>
                  )}
                  {item.reason && (
                    <div className="mt-1.5 text-rose-900">
                      <span className="font-semibold">Reason: </span>
                      <span className="break-words">{item.reason}</span>
                    </div>
                  )}
                  {isFallbackSource && (
                    <div className="mt-1.5 text-[11px] text-amber-900 font-medium bg-amber-100/60 rounded p-1.5 border border-amber-200">
                      Note: Used only as fallback processing source; relevance remains Not Related.
                    </div>
                  )}
                  {!isFallbackSource && isZeroRelatedFallback && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Excluded from processing.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
            {related.length === 1 ? "Relevant Paper (Included in Processing)" : "Relevant Papers (Included in Processing)"}
          </p>
          <div className="space-y-3 min-w-0">
            {related.map((item, idx) => (
              <div key={idx} className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3.5 text-xs min-w-0 shadow-sm">
                <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                  <div className="font-medium text-foreground text-sm break-words">
                    [{item.index}] "{item.title || item.file_name}"
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300 flex-shrink-0 font-medium">
                    Relevant
                  </Badge>
                </div>
                {item.file_name && item.file_name !== item.title && (
                  <div className="text-[11px] text-muted-foreground mb-1 break-words">File: {item.file_name}</div>
                )}
                {item.summary && (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed break-words">{item.summary}</p>
                )}

                {/* Supporting Research Points (≥2 Genuine Substantive Connections) */}
                {Array.isArray(item.substantive_connections) && item.substantive_connections.length > 0 ? (
                  <div className="mt-2.5 rounded bg-emerald-100/60 p-2.5 border border-emerald-200/80 text-xs">
                    <span className="font-semibold text-emerald-950 block mb-1">
                      Supporting Research Points:
                    </span>
                    <ol className="list-decimal pl-4 space-y-1 text-emerald-900">
                      {(item.substantive_connections as string[]).map((point: string, pIdx: number) => (
                        <li key={pIdx} className="break-words leading-relaxed">{point.replace(/^\d+\.\s*/, "")}</li>
                      ))}
                    </ol>
                  </div>
                ) : item.reason ? (
                  <div className="mt-2 rounded bg-emerald-100/60 p-2 text-xs text-emerald-950 border border-emerald-200/60">
                    <span className="font-semibold">Supporting Research Connection: </span>
                    <span className="break-words">{item.reason}</span>
                  </div>
                ) : null}

                {item.keywords && item.keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.keywords.map((kw, i) => (
                      <span key={i} className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground border">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SimilarPapersSection({ similarPapers }: { similarPapers?: RecommendedAcademicPaper[] }) {
  if (!similarPapers) return null;

  if (similarPapers.length === 0) {
    return (
      <Section title="Most Similar Research Papers">
        <div className="rounded-md border border-border bg-card/60 p-4 text-xs text-muted-foreground text-center">
          <p className="font-medium text-foreground mb-1">NO RELEVANT LITERATURE PAPER FOUND</p>
          <p>No external candidate literature papers satisfied the strict 2+ substantive research connections criteria.</p>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Most Similar Research Papers">
      <p className="text-xs text-muted-foreground mb-4">
        Validated external research papers verified using the strict 2+ substantive research connections criteria.
      </p>
      <div className="space-y-4 min-w-0">
        {similarPapers.map((paper, idx) => (
          <div key={idx} className="rounded-lg border border-border bg-card p-4 shadow-sm hover:border-gold/60 transition-colors min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground mb-0.5">
                  [{idx + 1}] {paper.year ? `${paper.year} · ` : ""}{paper.venue}
                </div>
                <h5 className="font-serif text-base font-medium text-foreground break-words">
                  {paper.title}
                </h5>
                <div className="text-xs text-muted-foreground italic mt-0.5 break-words">
                  {Array.isArray(paper.authors) ? paper.authors.join(", ") : paper.authors}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
                  Relevant
                </Badge>
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1"
                >
                  View Paper <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {paper.supporting_points && paper.supporting_points.length > 0 ? (
              <div className="mt-2.5 rounded bg-secondary/60 p-2.5 text-xs border border-border/60">
                <span className="font-semibold text-foreground block mb-1">
                  Supporting Research Points:
                </span>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                  {paper.supporting_points.map((pt, ptIdx) => (
                    <li key={ptIdx} className="break-words leading-relaxed">{pt.replace(/^\d+\.\s*/, "")}</li>
                  ))}
                </ol>
              </div>
            ) : paper.why_relevant ? (
              <div className="mt-2.5 rounded bg-secondary/50 p-2 text-xs">
                <span className="font-semibold text-foreground">Why Relevant: </span>
                <span className="text-muted-foreground break-words">{paper.why_relevant}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function TopicPage() {
  const { topicId } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getTopic);
  const reg = useServerFn(registerPaper);
  const del = useServerFn(deletePaper);
  const run = useServerFn(runAgent);
  const runAll = useServerFn(runAllAgents);
  const ingest = useServerFn(ingestPaper);

  const dataQ = useQuery({
    queryKey: ["topic", topicId],
    queryFn: () => get({ data: { id: topicId } }),
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const currentCount = dataQ.data?.papers?.length ?? 0;
    if (currentCount + files.length > 15) {
      toast.error("Error: Maximum 15 research papers are allowed per run. Please remove extra paper(s) and try again.");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      for (const file of Array.from(files)) {
        if (file.type !== "application/pdf") {
          toast.error(`${file.name} is not a PDF`);
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is over 20MB`);
          continue;
        }
        const path = `${u.user.id}/${topicId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("papers").upload(path, file, { contentType: "application/pdf" });
        if (upErr) { toast.error(upErr.message); continue; }
        const paper = await reg({ data: { topic_id: topicId, file_name: file.name, storage_path: path, size_bytes: file.size } });
        // Fire-and-forget background ingestion for chat
        ingest({ data: { paper_id: (paper as any).id } }).catch((e) => console.warn("ingest failed", e));
      }
      toast.success("Papers uploaded — ready for analysis");
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const delPaperM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic", topicId] }),
  });

  const runM = useMutation({
    mutationFn: (agent: AgentKey) => run({ data: { topic_id: topicId, agent_type: agent } }),
    onSuccess: (_d, agent) => {
      toast.success(`${AGENTS.find(a => a.key === agent)?.title} completed`);
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAllM = useMutation({
    mutationFn: () => runAll({ data: { topic_id: topicId } }),
    onSuccess: () => {
      toast.success("All agents finished — your report is ready");
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (dataQ.isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (dataQ.isError || !dataQ.data) return <div className="p-12 text-center text-destructive">Failed to load topic</div>;

  const { topic, papers, runs, report } = dataQ.data;
  const isOverPaperLimit = papers.length > 15;

  const latestByAgent = (key: AgentKey) =>
    runs.find((r: any) => r.agent_type === key && r.status === "completed") ?? null;
  const anyRunning = runs.some((r: any) => r.status === "running") || runM.isPending || runAllM.isPending;

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> All topics
        </Link>

        <div className="flex items-end justify-between gap-4 mb-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">Research Topic</p>
            <h1 className="font-serif text-4xl text-foreground">{topic.title}</h1>
            {topic.description && <p className="mt-2 text-muted-foreground max-w-2xl">{topic.description}</p>}
          </div>
          <Button
            onClick={() => runAllM.mutate()}
            disabled={papers.length === 0 || isOverPaperLimit || anyRunning}
            className="gap-2"
          >
            {runAllM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Run all agents
          </Button>
        </div>

        {isOverPaperLimit && (
          <div className="my-4 rounded-md border border-destructive bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Error: Maximum 15 research papers are allowed per run. Please remove the extra paper(s) and try again.</span>
          </div>
        )}

        <div className="rule-gold my-6" />

        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-8">
          {/* Sidebar - papers */}
          <aside>
            <Card className="bg-paper shadow-paper p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-lg">Papers</h2>
                <Badge variant={isOverPaperLimit ? "destructive" : "secondary"} className="rounded-full">
                  {papers.length} / 15
                </Badge>
              </div>

              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 mb-3"
                onClick={() => fileInput.current?.click()}
                disabled={uploading || papers.length >= 15}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload PDFs
              </Button>

              {papers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Upload at least one PDF (maximum 15) to begin.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {papers.map((p: any) => (
                    <li key={p.id} className="group flex items-start gap-2 rounded-md p-2 hover:bg-secondary/60">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="flex-1 truncate text-foreground" title={p.file_name}>{p.file_name}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={() => delPaperM.mutate(p.id)}
                        aria-label="Remove paper"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">Maximum 15 research papers are allowed per run.</p>
            </Card>
          </aside>

          {/* Agents + outputs */}
          <section className="space-y-4 min-w-0">
            <div className="grid gap-3">
              {AGENTS.map((a) => {
                const latest = latestByAgent(a.key);
                const pending = runs.find((r: any) => r.agent_type === a.key && r.status === "running");
                const failed = runs.find((r: any) => r.agent_type === a.key && r.status === "failed");
                const Icon = a.icon;
                return (
                  <Card key={a.key} className="bg-card border-border p-5 shadow-paper">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-ink text-primary-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-serif text-lg">{a.title}</h3>
                          {latest && <span className="inline-flex items-center gap-1 text-[11px] text-primary"><CheckCircle2 className="h-3 w-3"/> completed</span>}
                          {pending && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin"/> running</span>}
                          {failed && !latest && <span className="inline-flex items-center gap-1 text-[11px] text-destructive"><AlertCircle className="h-3 w-3"/> failed</span>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={latest ? "secondary" : "default"}
                        className="gap-1.5 flex-shrink-0"
                        disabled={anyRunning || papers.length === 0 || isOverPaperLimit}
                        onClick={() => runM.mutate(a.key)}
                      >
                        <Play className="h-3 w-3" />
                        {latest ? "Re-run" : "Run"}
                      </Button>
                    </div>
                    {failed?.error && !latest && (
                      <p className="mt-3 text-xs text-destructive bg-destructive/10 rounded p-2">{failed.error}</p>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Output viewer */}
            <Card className="bg-paper shadow-paper p-6 mt-6 min-w-0">
              <Tabs defaultValue="literature" className="min-w-0">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <TabsList className="bg-secondary/60 flex-wrap h-auto">
                    {AGENTS.map((a) => {
                      const short = a.title.replace(/^(Research|Paper|Evidence)\s+/, "") || a.title;
                      return (
                        <TabsTrigger key={a.key} value={a.key} className="capitalize">{short}</TabsTrigger>
                      );
                    })}
                    <TabsTrigger value="chat" className="gap-1.5">
                      <MessageSquare className="h-3 w-3" /> Chat
                    </TabsTrigger>
                  </TabsList>
                  {report && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportReportPdf(topic.title, report.content)}>
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportReportDocx(topic.title, report.content)}>
                        <Download className="h-3.5 w-3.5" /> DOCX
                      </Button>
                    </div>
                  )}
                </div>
                {AGENTS.map((a) => {
                  const latest = latestByAgent(a.key);
                  return (
                    <TabsContent key={a.key} value={a.key} className="min-w-0">
                      {latest?.output ? (
                        <AgentOutput agent={a.key} output={latest.output} />
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-12">
                          Run the {a.title} agent to see its output here.
                        </p>
                      )}
                    </TabsContent>
                  );
                })}
                <TabsContent value="chat" className="min-w-0">
                  <PaperChat topicId={topicId} />
                </TabsContent>
              </Tabs>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 min-w-0">
      <h4 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">{title}</h4>
      <div className="text-sm leading-relaxed text-foreground min-w-0">{children}</div>
    </div>
  );
}

function AgentOutput({ agent, output }: { agent: AgentKey; output: any }) {
  const confidence = output?.confidence;
  const relevanceCheck = output?.relevance_check;

  const wrap = (node: React.ReactNode) => (
    <div>
      {agent === "literature" && <RelevanceCheckSection relevanceCheck={relevanceCheck} />}
      <ConfidencePill c={confidence} />
      {node}
    </div>
  );

  // If no related papers found for this run
  if (output?.no_related_papers) {
    return wrap(
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center text-sm">
        <XCircle className="h-8 w-8 text-destructive mx-auto mb-2 opacity-80" />
        <h4 className="font-serif text-base font-medium text-foreground mb-1">No Related Papers Available</h4>
        <p className="text-muted-foreground max-w-md mx-auto">
          {output.message || "All uploaded papers were classified as Not Related / Out of Topic. Substantive agent analysis cannot proceed without at least one related paper."}
        </p>
      </div>
    );
  }

  if (agent === "literature") {
    return wrap(
      <div>
        <Section title="Overview"><p className="whitespace-pre-line">{output.overview}</p></Section>
        {output.themes && (
          <Section title="Themes">
            <div className="flex flex-wrap gap-1.5">
              {output.themes.map((t: string, i: number) => <Badge key={i} variant="secondary">{t}</Badge>)}
            </div>
          </Section>
        )}
        <Section title="Papers">
          <div className="space-y-4">
            {(output.papers ?? []).map((p: any) => (
              <div key={p.index} className="border-l-2 border-gold pl-4">
                <div className="text-xs text-muted-foreground">[{p.index}] {p.year} · {p.venue}</div>
                <div className="font-serif text-base text-foreground">{p.title}</div>
                <div className="text-xs text-muted-foreground italic">{(p.authors ?? []).join(", ")}</div>
                <p className="mt-2 text-sm">{p.summary}</p>
                {p.keywords?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.keywords.map((k: string, i: number) => <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>)}
                  </div>
                )}
                {p.findings?.length > 0 && (
                  <div className="mt-2"><span className="text-xs font-medium">Findings:</span>
                    <ul className="list-disc pl-5 text-xs mt-1 space-y-0.5">{p.findings.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
                {p.limitations?.length > 0 && (
                  <div className="mt-2"><span className="text-xs font-medium">Limitations:</span>
                    <ul className="list-disc pl-5 text-xs mt-1 space-y-0.5">{p.limitations.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
        {output.similar_papers && output.similar_papers.length > 0 && (
          <SimilarPapersSection similarPapers={output.similar_papers} />
        )}
      </div>,
    );
  }
  if (agent === "citation") {
    return wrap(
      <div>
        {(["apa", "ieee", "bibtex"] as const).map((style) => (
          <Section key={style} title={style.toUpperCase()}>
            <pre className="whitespace-pre-wrap font-mono text-xs bg-secondary/40 rounded p-3 border border-border">
              {(output[style] ?? []).join("\n\n")}
            </pre>
          </Section>
        ))}
      </div>,
    );
  }
  if (agent === "gap") {
    return wrap(
      <div>
        <Section title="Comparative analysis"><p className="whitespace-pre-line">{output.comparative_analysis}</p></Section>
        {typeof output.novelty_score === "number" && (
          <Section title="Novelty score">
            <div className="flex items-center gap-3">
              <div className="font-serif text-3xl text-primary">{output.novelty_score}</div>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-ink" style={{ width: `${output.novelty_score}%` }} />
              </div>
            </div>
          </Section>
        )}
        <Section title="Identified gaps">
          <div className="space-y-3">
            {(output.gaps ?? []).map((g: any, i: number) => (
              <div key={i} className="border-l-2 border-gold pl-4">
                <div className="font-medium">{g.theme}</div>
                <p className="text-sm">{g.description}</p>
                {g.evidence_indices?.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">Evidence: {g.evidence_indices.map((e: number) => `[${e}]`).join(" ")}</div>
                )}
              </div>
            ))}
          </div>
        </Section>
        <Section title="Unexplored areas">
          <ul className="list-disc pl-5 space-y-1">{(output.unexplored_areas ?? []).map((u: string, i: number) => <li key={i}>{u}</li>)}</ul>
        </Section>
        <Section title="Future directions">
          <ul className="list-disc pl-5 space-y-1">{(output.future_directions ?? []).map((u: string, i: number) => <li key={i}>{u}</li>)}</ul>
        </Section>
      </div>,
    );
  }
  if (agent === "methodology") {
    return wrap(
      <div>
        <Section title="Research method"><p className="whitespace-pre-line">{output.research_method}</p></Section>
        {(["algorithms", "datasets", "tools", "evaluation_metrics"] as const).map((k) => (
          <Section key={k} title={k.replace("_", " ")}>
            <div className="grid sm:grid-cols-2 gap-2">
              {(output[k] ?? []).map((x: any, i: number) => (
                <div key={i} className="rounded-md border border-border bg-card p-3">
                  <div className="font-medium text-sm">{x.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{x.why ?? x.purpose ?? x.url_or_source}</div>
                </div>
              ))}
            </div>
          </Section>
        ))}
        <Section title="Experimental pipeline">
          <ol className="list-decimal pl-5 space-y-1">{(output.experimental_pipeline ?? []).map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
        </Section>
        <Section title="Expected contribution"><p>{output.expected_contribution}</p></Section>
      </div>,
    );
  }
  if (agent === "evidence") {
    const claims = Array.isArray(output.claims) ? output.claims : [];
    const rawUnsupported: string[] = Array.isArray(output.unsupported_claims) ? output.unsupported_claims : [];
    const unsupported = rawUnsupported.filter((s) => {
      const lower = String(s).toLowerCase();
      if (lower.includes("atelier") && (lower.includes("production deployment") || lower.includes("unverified real-world") || lower.includes("explicit experimental data"))) {
        return false;
      }
      return Boolean(s && String(s).trim());
    });

    return wrap(
      <div className="space-y-6 min-w-0">
        <Section title="Research Claims & Evidence Grounding">
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No research claims evaluated.</p>
          ) : (
            <div className="space-y-4 min-w-0">
              {claims.map((c: any, i: number) => {
                const pageText = c.page
                  ? String(c.page).trim().startsWith("p")
                    ? c.page
                    : `p. ${c.page}`
                  : "Page number unavailable";

                const citationText = c.citation || `[${c.paper_index ?? 1}, ${pageText}]`;

                return (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {getVerificationBadge(c.status, c.verified)}
                        <span className="text-xs font-mono text-muted-foreground break-words">
                          {citationText}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-secondary/70 text-muted-foreground border-border">
                        {c.claim_source || "Extracted Research Claim"}
                      </Badge>
                    </div>

                    <div className="min-w-0">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground block mb-0.5">
                        Claim
                      </span>
                      <p className="text-sm font-medium text-foreground break-words">{c.statement}</p>
                    </div>

                    <div className="text-xs text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0 pt-1 border-t border-border/60">
                      <span className="font-semibold text-foreground">Source Paper:</span>
                      <span className="italic text-foreground/90 break-words">{c.paper_title || `Paper ${c.paper_index ?? 1}`}</span>
                      <span>·</span>
                      <span>Page: <span className="font-mono text-foreground/90">{pageText}</span></span>
                    </div>

                    {(c.snippet || c.evidence) && (
                      <div className="min-w-0">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground block mb-1">
                          Supporting Evidence
                        </span>
                        <blockquote className="border-l-2 border-gold pl-3 text-xs italic text-muted-foreground break-words whitespace-pre-wrap">
                          "{c.snippet || c.evidence}"
                        </blockquote>
                      </div>
                    )}

                    {(c.explanation || c.notes) && (
                      <div className="rounded bg-secondary/50 p-2.5 text-xs min-w-0">
                        <span className="font-semibold text-foreground">Explanation: </span>
                        <span className="text-muted-foreground break-words">{c.explanation || c.notes}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Unsupported Claims / Insufficient Evidence">
          {unsupported.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No unsupported claims identified from the provided source papers.
            </p>
          ) : (
            <div className="space-y-2 min-w-0">
              {unsupported.map((s: string, i: number) => (
                <div key={i} className="rounded-md border border-rose-200/70 bg-rose-50/50 p-3 text-xs text-foreground min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="destructive" className="text-[10px]">
                      Not Supported / Insufficient Evidence
                    </Badge>
                  </div>
                  <p className="break-words text-rose-950 dark:text-rose-200">{s}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>,
    );
  }
  if (agent === "comparison") {
    const cols: string[] = output.columns ?? ["Title","Authors","Year","Objective","Dataset","Algorithm","Methodology","Results","Limitations","Future Work"];
    const rows: any[] = output.rows ?? [];
    return wrap(
      <div>
        <Section title="Comparison matrix">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/60">
                  {cols.map((c) => (
                    <th key={c} className="text-left p-2 border border-border font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="align-top">
                    <td className="p-2 border border-border">{r.title}</td>
                    <td className="p-2 border border-border">{r.authors}</td>
                    <td className="p-2 border border-border">{r.year}</td>
                    <td className="p-2 border border-border">{r.objective}</td>
                    <td className="p-2 border border-border">{r.dataset}</td>
                    <td className="p-2 border border-border">{r.algorithm}</td>
                    <td className="p-2 border border-border">{r.methodology}</td>
                    <td className="p-2 border border-border">{r.results}</td>
                    <td className="p-2 border border-border">{r.limitations}</td>
                    <td className="p-2 border border-border">{r.future_work}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        {output.synthesis && <Section title="Synthesis"><p className="whitespace-pre-line">{output.synthesis}</p></Section>}
      </div>,
    );
  }
  if (agent === "novelty") {
    return wrap(
      <div>
        {typeof output.novelty_score === "number" && (
          <Section title="Novelty score">
            <div className="flex items-center gap-3">
              <div className="font-serif text-3xl text-primary">{output.novelty_score}</div>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-ink" style={{ width: `${output.novelty_score}%` }} />
              </div>
            </div>
          </Section>
        )}
        {output.innovation_summary && <Section title="Innovation summary"><p>{output.innovation_summary}</p></Section>}
        {output.unique_contribution && <Section title="Unique contribution"><p>{output.unique_contribution}</p></Section>}
        {output.similar_existing_research?.length > 0 && (
          <Section title="Similar existing research">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {output.similar_existing_research.map((s: any, i: number) => (
                <li key={i}>[{s.paper_index}] {s.note}</li>
              ))}
            </ul>
          </Section>
        )}
        {output.possible_research_directions?.length > 0 && (
          <Section title="Possible research directions">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {output.possible_research_directions.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </Section>
        )}
        {output.risks?.length > 0 && (
          <Section title="Risks">
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {output.risks.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </Section>
        )}
        <p className="text-[11px] text-muted-foreground italic">AI-generated recommendation — not a scientific guarantee.</p>
      </div>,
    );
  }
  if (agent === "roadmap") {
    return wrap(
      <div>
        {typeof output.total_duration_weeks === "number" && (
          <p className="text-sm text-muted-foreground mb-3">Estimated total duration: <span className="font-medium text-foreground">{output.total_duration_weeks} weeks</span></p>
        )}
        <Section title="Phases">
          <ol className="space-y-3">
            {(output.phases ?? []).map((p: any, i: number) => (
              <li key={i} className="border-l-2 border-gold pl-4">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-serif text-base">{i + 1}. {p.phase}</span>
                  {p.duration_weeks != null && <Badge variant="outline" className="text-[10px]">{p.duration_weeks}w</Badge>}
                </div>
                {p.objectives?.length > 0 && (
                  <div className="mt-1"><span className="text-xs font-medium">Objectives:</span>
                    <ul className="list-disc pl-5 text-xs mt-0.5">{p.objectives.map((o: string, j: number) => <li key={j}>{o}</li>)}</ul>
                  </div>
                )}
                {p.deliverables?.length > 0 && (
                  <div className="mt-1"><span className="text-xs font-medium">Deliverables:</span>
                    <ul className="list-disc pl-5 text-xs mt-0.5">{p.deliverables.map((o: string, j: number) => <li key={j}>{o}</li>)}</ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>
        {output.milestones?.length > 0 && (
          <Section title="Milestones">
            <ul className="list-disc pl-5 space-y-1 text-sm">{output.milestones.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
          </Section>
        )}
      </div>,
    );
  }
  if (agent === "report") {
    const sections: [string, string][] = [
      ["Executive summary", output.executive_summary],
      ["Abstract", output.abstract],
      ["Introduction", output.introduction],
      ["Literature review", output.literature_review],
      ["Research gaps", output.research_gaps],
      ["Proposed methodology", output.proposed_methodology],
      ["Evidence verification", output.evidence_verification],
      ["Confidence analysis", output.confidence_analysis],
      ["Paper comparison", output.paper_comparison],
      ["Novelty analysis", output.novelty_analysis],
      ["Research roadmap", output.research_roadmap],
      ["Future scope", output.future_scope],
      ["Conclusion", output.conclusion],
    ];
    return wrap(
      <article className="prose-academic space-y-5">
        <header>
          <h2 className="font-serif text-2xl text-foreground">{output.title}</h2>
          {output.keywords && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {output.keywords.map((k: string, i: number) => <Badge key={i} variant="outline">{k}</Badge>)}
            </div>
          )}
        </header>
        {sections.map(([label, body]) => body ? (
          <Section key={label} title={label}><p className="whitespace-pre-line">{body}</p></Section>
        ) : null)}
        {output.citation_list?.length > 0 && (
          <Section title="Citations">
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              {output.citation_list.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ol>
          </Section>
        )}
        {output.references?.length > 0 && (
          <Section title="References">
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              {output.references.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ol>
          </Section>
        )}
      </article>,
    );
  }
  return wrap(<pre className="text-xs">{JSON.stringify(output, null, 2)}</pre>);
}
