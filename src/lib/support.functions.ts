import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callGemini } from "./ai-gateway.server";

export const askSupportChat = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      question: z.string().min(1).max(2000),
      history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
        .max(20)
        .optional()
        .default([]),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const history = (data.history ?? []).map((h) => ({ role: h.role, content: h.content }));

    const systemPrompt = `You are the official Support Assistant for Atelier, a state-of-the-art Multi-Agent Research Framework.
Your goal is to help users understand how to use Atelier, write scientific papers, coordinate AI agents, and format documents.

Here is the essential information about Atelier:
1. Overview: Atelier is an automated academic writing system that coordinates five specialized AI agents.
2. The 5 Agents:
   - Literature Review Agent: Synthesizes individual research paper PDFs, extracting objectives, methodologies, results, and limitations.
   - Citation Agent: Automatically creates clean citation lists and bibliographies in APA, IEEE, or BibTeX formats.
   - Research Gap Agent: Performs comparative analysis to highlight unexplored academic questions or conflicting evidence in the literature.
   - Methodology Agent: Proposes dataset acquisitions, machine learning algorithms, tools, and validation/evaluation metrics.
   - Report Generator Agent: Combines all outputs from the previous agents into a cohesive, publishable manuscript draft.
3. Steps to run:
   - Create a Topic in the Dashboard.
   - Upload PDF papers related to your research topic.
   - Index the papers (using the "Index now" button in Paper Chat) to enable retrieval.
   - Go to the agent workspace, and run each agent step-by-step or click to run the entire pipeline.
   - Review each agent's draft and edit if needed.
   - Click "Export Report" to download a Microsoft Word (.docx) or PDF document.

Be friendly, concise, and academic yet approachable. Format your response in clean Markdown with clear lists and bold text where appropriate. If a question is completely unrelated to Atelier, research papers, writing, or academia, gently redirect them to ask about Atelier's features or academic writing.`;

    const answer = await callGemini({
      model: "google/gemini-3.5-flash-lite",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...history,
        {
          role: "user",
          content: data.question,
        },
      ],
    });

    return { answer };
  });
