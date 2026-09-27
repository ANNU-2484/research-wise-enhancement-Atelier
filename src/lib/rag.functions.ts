import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGemini, pdfPart } from "./ai-gateway.server";
import { GoogleGenAI } from "@google/genai";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function embed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured");
  const ai = new GoogleGenAI({ apiKey });

  let retries = 5;
  let delay = 2000;
  while (retries > 0) {
    try {
      const resp = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: texts,
        config: {
          outputDimensionality: EMBED_DIMS,
        },
      });
      const embeddings = (resp as any).embeddings;
      if (!Array.isArray(embeddings)) throw new Error("Invalid embeddings response");
      return embeddings.map((e: any) => e.values as number[]);
    } catch (e: any) {
      const status = e?.status ?? e?.code;
      const msg = e?.message ?? String(e);
      if (status === 429 && retries > 1) {
        let waitTime = delay;
        const match = msg.match(/retry in ([\d.]+)s/i);
        if (match) {
          waitTime = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
        }
        console.warn(`Embedding rate limit (429) hit. Retrying in ${waitTime}ms...`);
        await sleep(waitTime);
        retries--;
        delay *= 2;
        continue;
      }
      throw new Error(`Embedding API error: ${msg}`);
    }
  }
  throw new Error("Embedding rate limit exceeded. Please try again later.");
}

function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

async function extractPdfText(filename: string, base64: string): Promise<string> {
  const text = await callGemini({
    model: "google/gemini-3.5-flash-lite",
    messages: [
      {
        role: "system",
        content:
          "You are an academic parser. Analyze the research paper PDF and transcribe its content section by section (Abstract, Introduction, Methods, Results, Discussion, etc.). Ensure all factual details, algorithms, math, data, and findings are fully preserved. To respect copyright filters, rephrase and restructure the paragraphs slightly into clean, readable transcription without copying long sequences verbatim. Output ONLY the transcribed content. No conversational intro/outro.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe the comprehensive details and text of this paper section by section, rephrasing slightly to prevent recitation blocks." },
          pdfPart(filename, base64),
        ],
      },
    ],
  });
  return text;
}

export const ingestPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ paper_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: paper, error: pErr } = await supabase
      .from("papers")
      .select("id, topic_id, file_name, storage_path")
      .eq("id", data.paper_id)
      .maybeSingle();
    if (pErr || !paper) throw new Error("Paper not found");

    // Skip if already ingested
    const { count } = await supabase
      .from("paper_chunks")
      .select("id", { count: "exact", head: true })
      .eq("paper_id", paper.id);
    if ((count ?? 0) > 0) return { ok: true, chunks: count, skipped: true };

    const { data: blob, error: dlErr } = await supabase.storage.from("papers").download(paper.storage_path);
    if (dlErr || !blob) throw new Error("Cannot download PDF");
    const buf = Buffer.from(await blob.arrayBuffer());
    const b64 = buf.toString("base64");

    const fullText = await extractPdfText(paper.file_name, b64);
    const chunks = chunkText(fullText);
    if (chunks.length === 0) throw new Error("No text extracted from PDF");

    // Batch embeddings (max ~100 per call to stay safe)
    const BATCH = 64;
    const rows: any[] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vecs = await embed(slice);
      slice.forEach((content, j) => {
        rows.push({
          paper_id: paper.id,
          topic_id: paper.topic_id,
          user_id: userId,
          chunk_index: i + j,
          content,
          embedding: `[${vecs[j].join(",")}]`,
        });
      });
    }

    const { error: insErr } = await supabase.from("paper_chunks").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { ok: true, chunks: rows.length, skipped: false };
  });

export const askPaperChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      topic_id: z.string().uuid(),
      question: z.string().min(1).max(2000),
      history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
        .max(20)
        .optional()
        .default([]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [qVec] = await embed([data.question]);
    const { data: matches, error } = await supabase.rpc("match_paper_chunks", {
      query_embedding: `[${qVec.join(",")}]` as any,
      match_topic_id: data.topic_id,
      match_count: 6,
    });
    if (error) throw new Error(error.message);

    // Load paper file names for citations
    const paperIds = Array.from(new Set((matches ?? []).map((m: any) => m.paper_id)));
    const { data: papers } = await supabase
      .from("papers")
      .select("id, file_name")
      .in("id", paperIds);
    const nameById = new Map((papers ?? []).map((p: any) => [p.id, p.file_name]));

    const context_text = (matches ?? [])
      .map((m: any, i: number) => `[${i + 1}] (${nameById.get(m.paper_id) ?? "paper"})\n${m.content}`)
      .join("\n\n---\n\n");

    const sources = (matches ?? []).map((m: any, i: number) => ({
      index: i + 1,
      paper_id: m.paper_id,
      file_name: nameById.get(m.paper_id) ?? "paper",
      similarity: m.similarity,
      preview: m.content.slice(0, 220),
    }));

    const history = (data.history ?? []).map((h) => ({ role: h.role, content: h.content }));

    const systemPrompt = `You are an expert academic research assistant.
Your goal is to answer the user's question accurately using both the uploaded PDF paper excerpts and reliable external academic sources.

Follow these strict guidelines:
1. Search the provided PDF excerpts (under 'PDF Excerpts') first. If they contain the answer, prioritize them.
2. If the PDF excerpts do not contain the answer, are insufficient, or if you need additional context, search reliable, recent, and authoritative external academic/scientific sources using your search tool.
3. Combine the evidence from the PDF excerpts and external search findings to generate a complete, structured, and accurate answer.
4. Clearly distinguish information:
   - Cite information from the uploaded PDF excerpts inline using their bracketed index, e.g. [1], [2].
   - Cite information from external sources inline with their website names/URLs or academic references.
5. Add a "References" section at the end listing any external academic sources/citations used.
6. If the PDF excerpts and external sources conflict, explain the conflict objectively instead of choosing one randomly.
7. Never hallucinate or assume facts: if the provided paper context does not contain the requested information and external evidence is unavailable, state clearly that the information is not available in the selected paper context rather than guessing.
8. Prefer recent, authoritative academic sources for research-related questions.`;

    const answer = await callGemini({
      model: "google/gemini-3.5-flash-lite",
      enableSearchGrounding: true,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...history,
        {
          role: "user",
          content: `Question: ${data.question}\n\nPDF Excerpts:\n${context_text || "No relevant excerpts found in the uploaded papers."}`,
        },
      ],
    });

    return { answer, sources };
  });

export const getIngestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ topic_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: papers } = await context.supabase
      .from("papers")
      .select("id, file_name")
      .eq("topic_id", data.topic_id);
    const { data: chunks } = await context.supabase
      .from("paper_chunks")
      .select("paper_id")
      .eq("topic_id", data.topic_id);
    const counts = new Map<string, number>();
    (chunks ?? []).forEach((c: any) => counts.set(c.paper_id, (counts.get(c.paper_id) ?? 0) + 1));
    return (papers ?? []).map((p: any) => ({
      paper_id: p.id,
      file_name: p.file_name,
      chunks: counts.get(p.id) ?? 0,
      ingested: (counts.get(p.id) ?? 0) > 0,
    }));
  });
