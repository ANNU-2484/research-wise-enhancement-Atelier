import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BookOpen, Quote, Search, FlaskConical, ScrollText,
  ArrowRight, FileText, BrainCircuit, Network,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atelier — Multi-Agent Automated Literature Review" },
      { name: "description", content: "Five specialised AI agents collaborate to read papers, generate citations, and produce publishable research reports." },
      { property: "og:title", content: "Atelier — Multi-Agent Research Framework" },
      { property: "og:description", content: "Five specialised AI agents collaborate to read papers, generate citations, and produce publishable research reports." },
      { property: "og:url", content: "https://cozy-connect-73.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://cozy-connect-73.lovable.app/" }],
  }),
  component: Landing,
});

const AGENTS = [
  { icon: BookOpen, name: "Literature Review", role: "Reads PDFs, extracts summaries, objectives, findings and limitations." },
  { icon: Quote, name: "Citation", role: "Generates APA, IEEE and BibTeX bibliographies." },
  { icon: Search, name: "Research Gap", role: "Compares papers and surfaces unexplored areas and novelty." },
  { icon: FlaskConical, name: "Methodology", role: "Recommends algorithms, datasets, tools and evaluation metrics." },
  { icon: ScrollText, name: "Report Generator", role: "Compiles every output into a publishable research report." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-primary-foreground shadow-paper">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="font-serif text-base font-semibold tracking-tight">Atelier</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Research Framework</div>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-20 text-center">

          <h1 className="font-serif text-5xl md:text-6xl text-foreground leading-[1.05] tracking-tight">
            Multi-agent.<br />
            One <em className="text-primary not-italic">research</em> manuscript.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload your PDFs. A coordinated team of AI agents reads, compares,
            cites, and recommends — then produces a complete literature review,
            research gap analysis and methodology section.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth">Begin a study <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#how">How it works</a>
            </Button>
          </div>
          <div className="rule-gold mt-16 max-w-md mx-auto" />
        </section>

        {/* Agents grid */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center mb-12">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">The Collaborative</p>
            <h2 className="font-serif text-4xl text-foreground">A team of specialists, not a chatbot</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Each agent has a single responsibility and hands its output to the next — like a real research lab.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
            {AGENTS.map((a, i) => (
              <Card key={a.name} className="bg-paper shadow-paper p-5 border-border">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-primary-foreground mb-3">
                  <a.icon className="h-4 w-4" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Agent {i + 1}</div>
                <h3 className="font-serif text-lg mt-1 text-foreground">{a.name}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{a.role}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-card border-border p-6 shadow-paper">
              <FileText className="h-5 w-5 text-primary mb-3" />
              <h3 className="font-serif text-xl mb-2">1. Upload</h3>
              <p className="text-sm text-muted-foreground">Drop your research PDFs into a new topic. We store them privately to your account.</p>
            </Card>
            <Card className="bg-card border-border p-6 shadow-paper">
              <Network className="h-5 w-5 text-primary mb-3" />
              <h3 className="font-serif text-xl mb-2">2. Orchestrate</h3>
              <p className="text-sm text-muted-foreground">Run agents individually or chain the entire pipeline with one click.</p>
            </Card>
            <Card className="bg-card border-border p-6 shadow-paper">
              <BrainCircuit className="h-5 w-5 text-primary mb-3" />
              <h3 className="font-serif text-xl mb-2">3. Export</h3>
              <p className="text-sm text-muted-foreground">Download your final manuscript as PDF or DOCX, with citations and references.</p>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Atelier — Multi-Agent Research Framework</div>
          <Link to="/auth" className="hover:text-foreground">Sign in →</Link>
        </div>
      </footer>
    </div>
  );
}
