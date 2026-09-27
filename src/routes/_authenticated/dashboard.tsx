import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createTopic, listTopics, deleteTopic } from "@/lib/topics.functions";
import { Plus, FileText, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Atelier" },
      { name: "description", content: "Manage your research topics and AI-generated literature reviews." },
      { property: "og:title", content: "Dashboard · Atelier" },
      { property: "og:description", content: "Manage your research topics and AI-generated literature reviews in your Atelier workspace." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://cozy-connect-73.lovable.app/dashboard" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listTopics);
  const create = useServerFn(createTopic);
  const del = useServerFn(deleteTopic);

  const topicsQ = useQuery({ queryKey: ["topics"], queryFn: () => list() });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const createM = useMutation({
    mutationFn: () => create({ data: { title, description: desc } }),
    onSuccess: (row: any) => {
      toast.success("Topic created");
      qc.invalidateQueries({ queryKey: ["topics"] });
      setOpen(false); setTitle(""); setDesc("");
      navigate({ to: "/topics/$topicId", params: { topicId: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Topic deleted");
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">Your Studio</p>
            <h1 className="font-serif text-4xl text-foreground">Research Topics</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Each topic is a workspace. Upload papers, let the multi-agent system collaborate, and export a complete research report.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="default" className="gap-2">
                <Plus className="h-4 w-4" />
                New topic
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Start a new research topic</DialogTitle>
                <DialogDescription>
                  Give your topic a working title. You can refine the abstract later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="e.g. Artificial Intelligence in Education"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Textarea
                  placeholder="A brief description of the research direction (optional)"
                  rows={4}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button onClick={() => createM.mutate()} disabled={title.length < 2 || createM.isPending}>
                  {createM.isPending ? "Creating…" : "Create topic"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rule-gold mb-8" />

        {topicsQ.isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : topicsQ.data && topicsQ.data.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {topicsQ.data.map((t: any) => (
              <Card key={t.id} className="bg-paper shadow-paper border-border overflow-hidden group">
                <Link to="/topics/$topicId" params={{ topicId: t.id }} className="block p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif text-xl text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                        {t.title}
                      </h3>
                      {t.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                      )}
                      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Created {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                        <span aria-hidden>·</span>
                        <span className="capitalize">{t.status}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </Link>
                <div className="px-6 pb-4 -mt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive gap-1.5"
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm("Delete this topic and all its papers?")) delM.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-paper border-dashed border-border p-12 text-center shadow-paper">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/60 mb-4" />
            <h2 className="font-serif text-xl text-foreground mb-2">No topics yet</h2>
            <p className="text-muted-foreground mb-6">Create your first research topic to get started.</p>
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New topic
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
