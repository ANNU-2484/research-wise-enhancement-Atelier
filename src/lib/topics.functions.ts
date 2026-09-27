import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TopicInput = z.object({
  title: z.string().min(2).max(300),
  description: z.string().max(2000).optional().default(""),
});

export const createTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => TopicInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("topics")
      .insert({ title: data.title, description: data.description, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("topics")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const getTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [topicRes, papersRes, runsRes, reportsRes] = await Promise.all([
      context.supabase.from("topics").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("papers").select("*").eq("topic_id", data.id).order("created_at"),
      context.supabase.from("agent_runs").select("*").eq("topic_id", data.id).order("started_at", { ascending: false }),
      context.supabase.from("reports").select("*").eq("topic_id", data.id).order("created_at", { ascending: false }).limit(1),
    ]);
    if (topicRes.error) throw new Error(topicRes.error.message);
    if (!topicRes.data) throw new Error("Topic not found");
    return {
      topic: topicRes.data,
      papers: papersRes.data ?? [],
      runs: runsRes.data ?? [],
      report: reportsRes.data?.[0] ?? null,
    };
  });

export const deleteTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("topics").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().min(2), description: z.string().max(2000).optional().default("") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("topics")
      .update({ title: data.title, description: data.description })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registerPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      topic_id: z.string().uuid(),
      file_name: z.string().min(1),
      storage_path: z.string().min(1),
      size_bytes: z.number().int().nonnegative(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("papers")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: paper } = await context.supabase.from("papers").select("storage_path").eq("id", data.id).maybeSingle();
    if (paper?.storage_path) {
      await context.supabase.storage.from("papers").remove([paper.storage_path]);
    }
    const { error } = await context.supabase.from("papers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
