// Server-only helper for Google Gemini API (@google/genai).
// Provides JSON-mode chat completions with optional PDF file parts.

import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";

export type GeminiContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; mimeType: string; data: string } };

export type GeminiMessage = {
  role: "system" | "user" | "assistant";
  content: string | GeminiContentPart[];
};

export interface CallGeminiOptions {
  model?: string;
  messages: GeminiMessage[];
  jsonMode?: boolean;
  temperature?: number;
  enableSearchGrounding?: boolean;
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");
  return new GoogleGenAI({ apiKey });
}

function partsFromContent(content: string | GeminiContentPart[]): any[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((p) => {
    if (p.type === "text") return { text: p.text };
    return { inlineData: { mimeType: p.file.mimeType, data: p.file.data } };
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ConcurrencyLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];

  constructor(private maxConcurrency: number) { }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

// Global limiter to prevent concurrent calls to Gemini from hitting rate limits (especially during mass ingestion)
const limiter = new ConcurrencyLimiter(1);

export async function callGemini(opts: CallGeminiOptions): Promise<string> {
  const ai = getClient();
  const model = (opts.model ?? "gemini-3.5-flash-lite").replace(/^google\//, "");

  const systemParts: string[] = [];
  const contents: any[] = [];
  for (const msg of opts.messages) {
    if (msg.role === "system") {
      const text = typeof msg.content === "string"
        ? msg.content
        : msg.content.filter((p) => p.type === "text").map((p: any) => p.text).join("\n");
      systemParts.push(text);
      continue;
    }
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: partsFromContent(msg.content),
    });
  }

  const config: any = {};
  if (systemParts.length) config.systemInstruction = systemParts.join("\n\n");
  if (opts.jsonMode) config.responseMimeType = "application/json";
  if (typeof opts.temperature === "number") config.temperature = opts.temperature;
  if (opts.enableSearchGrounding) {
    config.tools = [{ googleSearch: {} }];
  }

  return limiter.run(async () => {
    let retries = 5;
    let delay = 2000;
    while (retries > 0) {
      try {
        const resp = await ai.models.generateContent({ model, contents, config });
        const text = resp.text;
        if (typeof text !== "string") {
          const candidate = resp.candidates?.[0];
          const finishReason = candidate?.finishReason;
          const safetyRatings = candidate?.safetyRatings;
          throw new Error(`Invalid Gemini response shape. Finish reason: ${finishReason || "unknown"}. Safety details: ${JSON.stringify(safetyRatings || {})}`);
        }
        return text;
      } catch (e: any) {
        const status = e?.status ?? e?.code;
        const msg = e?.message ?? String(e);
        const isRateLimit =
          status === 429 ||
          status === "RESOURCE_EXHAUSTED" ||
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("Quota exceeded") ||
          msg.toLowerCase().includes("quota") ||
          msg.toLowerCase().includes("rate limit") ||
          msg.toLowerCase().includes("resource exhausted");

        if (isRateLimit && retries > 1) {
          console.warn(`Gemini rate limit (429) hit. Retrying in ${delay}ms... (Remaining retries: ${retries - 1})`);
          await sleep(delay);
          retries--;
          delay *= 2;
          continue;
        }
        if (isRateLimit) {
          throw new Error("Gemini API error (429 RESOURCE_EXHAUSTED): API quota exceeded. Please wait a moment and try again.");
        }
        throw new Error(`Gemini API error: ${msg}`);
      }
    }
    throw new Error("Gemini rate limit exceeded. Please wait and try again.");
  });
}

export function safeParseJSON<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty response from AI model");
  }

  // 1. Remove markdown code fences & trim whitespace
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 2. Fast path: Direct JSON.parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to repair
  }

  // 3. Robust JSON repair
  try {
    const repaired = jsonrepair(text);
    return JSON.parse(repaired) as T;
  } catch {
    // Continue to structural extraction
  }

  // 4. Extract outermost JSON structure ({...} or [...])
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf("]");
  }

  if (startIdx !== -1) {
    const candidate = endIdx > startIdx ? text.slice(startIdx, endIdx + 1) : text.slice(startIdx);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try repair on candidate
    }
    try {
      const repaired = jsonrepair(candidate);
      return JSON.parse(repaired) as T;
    } catch {
      // Continue to truncation recovery
    }
  }

  // 5. Truncated output recovery: close unclosed quotes and open braces/brackets
  try {
    let truncated = text;
    let quoteCount = 0;
    for (let i = 0; i < truncated.length; i++) {
      if (truncated[i] === '"' && (i === 0 || truncated[i - 1] !== '\\')) quoteCount++;
    }
    if (quoteCount % 2 !== 0) truncated += '"';

    const openBraces = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
    const openBrackets = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
    for (let b = 0; b < openBrackets; b++) truncated += "]";
    for (let b = 0; b < openBraces; b++) truncated += "}";

    const repaired = jsonrepair(truncated);
    return JSON.parse(repaired) as T;
  } catch {
    // Final error below
  }

  const cleanPreview = text.length > 300 ? `${text.slice(0, 300)}...` : text;
  throw new Error(`Gemini did not return valid JSON: (preview: ${cleanPreview})`);
}

export async function callGeminiJSON<T = unknown>(opts: CallGeminiOptions): Promise<T> {
  const raw = await callGemini({ ...opts, jsonMode: true });
  return safeParseJSON<T>(raw);
}

export function pdfPart(filename: string, base64: string): GeminiContentPart {
  return {
    type: "file",
    file: { filename, mimeType: "application/pdf", data: base64 },
  };
}
