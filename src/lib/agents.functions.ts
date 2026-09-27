import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGeminiJSON, pdfPart, type GeminiContentPart } from "./ai-gateway.server";
import { fetchSimilarAcademicPapers, isNegativeOrNonAlignedStatement, type RecommendedAcademicPaper, type RelatedPaperContext } from "./academic-search.server";

const AgentTypeSchema = z.enum([
  "literature",
  "citation",
  "gap",
  "methodology",
  "evidence",
  "comparison",
  "novelty",
  "roadmap",
  "report",
]);
type AgentType = z.infer<typeof AgentTypeSchema>;

import type { Json } from "@/integrations/supabase/types";

export type PaperRelevanceItem = {
  [key: string]: Json | undefined;
  index: number;
  paper_id?: string;
  file_name: string;
  title: string;
  status: "related" | "not_related";
  substantive_connections_count?: number;
  substantive_connections?: string[];
  reason?: string;
  summary?: string;
  keywords?: string[];
};

const CONFIDENCE_CLAUSE =
  ' Always include a "confidence" object: {"score": 0-100, "level": "low"|"medium"|"high", "rationale": "1-2 sentence explanation of what drives the score (coverage of source material, agreement between papers, ambiguity, etc.)"}. Do not use unnecessary absolute claims such as "ensuring that all conclusions are fully supported" or imply 100% certainty. Use grounded wording such as "The conclusions are grounded in the retrieved source evidence."';

const SYSTEM_BASE =
  "You are part of a multi-agent academic research framework. " +
  "You must respond ONLY with strict, valid JSON matching the schema described. " +
  "All property names and string values MUST be enclosed in double quotes. No single quotes, no trailing commas, no markdown fences, no comments. " +
  "STRICT ACCURACY RULES: " +
  "1. Ground all generated content strictly in the provided validated context and source papers. " +
  "2. Do not hallucinate or extrapolate facts beyond the evidence. " +
  "3. Clearly distinguish between established findings in the literature and proposed/suggested methods or future work. " +
  "4. Never claim an experiment, dataset, result, deployment, or evaluation has been executed unless verified by the source context. " +
  "5. If information is uncertain or unavailable, state so explicitly. Prefer a concise, accurate output over unsupported text. " +
  "Be rigorous, concise, and cite the source paper indices where relevant." +
  CONFIDENCE_CLAUSE;

const PROMPTS: Record<AgentType, { title: string; instruction: string }> = {
  literature: {
    title: "Literature Review Agent",
    instruction: `Read the attached validated research papers for the topic "{topic}".
ACCURACY REQUIREMENTS:
- Synthesize ONLY the actual content present in the attached papers.
- Ensure all summaries, themes, findings, limitations, and objectives are grounded directly in the reviewed papers.
- Do not add information simply because it is generally associated with the topic.
Return strict, valid JSON:
{
  "overview": "3-5 paragraph synthesis of the field across these papers",
  "themes": ["theme1", "theme2"],
  "papers": [
    {
      "index": 1,
      "title": "...",
      "authors": ["..."],
      "year": 2023,
      "venue": "...",
      "summary": "150-250 word summary",
      "keywords": ["..."],
      "objectives": ["..."],
      "methodology": "...",
      "findings": ["..."],
      "limitations": ["..."]
    }
  ],
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Use the PDFs IN ORDER (index 1 = first attached, etc).`,
  },
  citation: {
    title: "Citation Agent",
    instruction: `You are the Citation Agent. Produce standard academic citations (APA 7th edition, IEEE, and BibTeX) for ALL validated relevant research papers.
ACCURACY REQUIREMENTS:
- Citations must accurately reflect ALL papers present in the validated relevant papers list.
- Do not invent citation details, page numbers, authors, or publication venues.
- Do not generate citations for irrelevant or excluded papers.
- Return strict, valid JSON:
{
  "apa": ["full APA 7 entry per paper"],
  "ieee": ["[1] full IEEE entry", "[2] ..."],
  "bibtex": ["@article{...}"],
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Inputs:
{relevant_papers_text}`,
  },
  gap: {
    title: "Research Gap Discovery Agent",
    instruction: `Given this literature review JSON for topic "{topic}", critically compare the papers and identify research gaps.
ACCURACY REQUIREMENTS:
- Ensure every identified gap is supported by the reviewed literature.
- Clearly distinguish between: (1) what the papers actually show, (2) what limitation/gap is reasonably identified, and (3) what may be a possible future research direction.
- Do not present a proposed solution as if it were already proven.
Return strict, valid JSON:
{
  "comparative_analysis": "1-2 paragraphs contrasting approaches",
  "gaps": [{"theme": "...", "description": "...", "evidence_indices": [1]}],
  "unexplored_areas": ["..."],
  "future_directions": ["..."],
  "novelty_score": 0-100,
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Input:\n{literature}`,
  },
  methodology: {
    title: "Methodology Recommendation Agent",
    instruction: `Given the topic "{topic}", literature review and identified gaps, recommend a concrete research methodology.
ACCURACY & WORDING REQUIREMENTS:
- Treat this strictly as a PROPOSED / SUGGESTED research methodology for future study.
- Do not describe proposed future methodology as already implemented or completed.
- Replace completed-sounding wording (e.g. "the algorithm is implemented", "pipelines are established") with proposed wording (e.g. "the algorithm is proposed to...", "pipelines are proposed/designed as part of the methodology").
- Datasets, tools, algorithms, and evaluation metrics recommended by this agent must be explicitly presented as suggested/proposed criteria.
- Do not fabricate experimental results or claim empirical validation unless verified by the source papers.
Return strict, valid JSON with all double-quoted keys and values:
{
  "research_method": "qualitative|quantitative|mixed|experimental — proposed research method with justification (paragraph)",
  "algorithms": [{"name": "...", "why": "..."}],
  "datasets": [{"name": "...", "url_or_source": "...", "why": "..."}],
  "tools": [{"name": "...", "purpose": "..."}],
  "evaluation_metrics": [{"name": "...", "why": "..."}],
  "experimental_pipeline": ["step 1", "step 2"],
  "expected_contribution": "...",
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Inputs:\nLiterature: {literature}\nGaps: {gaps}`,
  },
  evidence: {
    title: "Evidence Verification Agent",
    instruction: `You are an expert academic evidence verification agent for the research topic "{topic}".
Evaluate whether key research claims are actually supported by empirical or documented evidence available in the attached relevant research papers.

EVALUATION PROTOCOL:
1. CLAIMS TO EVALUATE:
   Evaluate candidate research claims from the provided Literature Review (and Research Gaps if available), or extract candidate factual research statements directly from the attached papers.
   For each claim, indicate its "claim_source":
   - "Literature Review" (if drawn from the literature review)
   - "Research Gap" (if drawn from gap analysis)
   - "Methodology" (if drawn from methodology)
   - "Extracted Research Claim" (if extracted directly as a key scientific assertion from the uploaded papers)

2. STRICT EVIDENCE GROUNDING (NO SELF-VERIFICATION):
   - A claim is "Verified" ONLY when actual source content in the attached paper directly supports it.
   - Do NOT mark a claim Verified just because AI generated similar wording in an earlier summary. Evidence must be independently located in the paper.
   - Do NOT confuse bibliographic/publication metadata (Author names, Journal, Volume, Issue, Publication year, DOI, URL, Paper registration) with research evidence. Evidence must be actual research findings, methodology descriptions, results, experimental observations, table/figure data, or documented limitations.
   - Only evaluate actual research statements present in the provided context or uploaded papers. Do NOT generate hypothetical claims, generic warnings, assumptions, or boilerplate.

3. VERIFICATION STATUS TAXONOMY:
   - "Verified" (or "Supported"): The source evidence directly and completely supports the claim. (Set "verified": true)
   - "Partially Supported": The source supports part of the claim or discusses it as a concept/challenge, but does not prove the complete claim. (Set "verified": false)
   - "Not Supported": The source contradicts the claim, disproves it, or does not support the assertion. (Set "verified": false)
   - "Insufficient Evidence": The uploaded papers do not contain enough information to determine whether the claim is supported. (Set "verified": false)

4. TRACEABILITY & CITATIONS:
   - Identify the source paper index (1-based) and actual paper title.
   - Identify the exact page number if determinable from the PDF (e.g. "p. 2", "pp. 2-3"). If page number is not determinable, use "Page number unavailable". Never invent or fabricate page numbers.
   - Extract a concise verbatim or near-verbatim supporting passage ("snippet", <= 400 chars).
   - Format citation: e.g. "[1, p.2]", "[1, pp.2-3]", or "[1, Page number unavailable]".
   - Provide a clear, concise scientific explanation of why the evidence supports, partially supports, or fails to support the claim.

Return JSON:
{
  "claims": [
    {
      "statement": "the research claim being evaluated",
      "claim_source": "Literature Review" | "Research Gap" | "Methodology" | "Extracted Research Claim",
      "paper_index": 1,
      "paper_title": "Exact source paper title",
      "page": "p. 2" | "pp. 2-3" | "Page number unavailable",
      "snippet": "concise verbatim or near-verbatim supporting passage from the paper",
      "citation": "[1, p.2]",
      "status": "Verified" | "Partially Supported" | "Not Supported" | "Insufficient Evidence",
      "verified": true,
      "explanation": "short scientific explanation of how the evidence supports or does not support the claim"
    }
  ],
  "unsupported_claims": [
    // List ONLY specific actual research claims from the evaluated papers that were found to be unsupported or have insufficient evidence.
    // If no unsupported claims exist from the evaluated papers, leave this array EMPTY: []
  ],
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Literature Review JSON:
{literature}
Research Gaps JSON (if available):
{gaps}`,
  },
  comparison: {
    title: "Paper Comparison Agent",
    instruction: `Given this literature review JSON for topic "{topic}", build a side-by-side comparison matrix of the papers.
ACCURACY REQUIREMENTS:
- Every comparison row and column must be strictly supported by the reviewed papers.
- Avoid turning interpretations into definite conclusions; present inferences as interpretations rather than proven facts.
Return JSON: {
  "columns": ["Title","Authors","Year","Research Objective","Dataset","Algorithm","Methodology","Results","Limitations","Future Work"],
  "rows": [
    {
      "index": 1,
      "title": "...",
      "authors": "A. Author, B. Author",
      "year": 2023,
      "objective": "...",
      "dataset": "...",
      "algorithm": "...",
      "methodology": "...",
      "results": "...",
      "limitations": "...",
      "future_work": "..."
    }
  ],
  "synthesis": "1-2 paragraphs highlighting the most important differences and agreements",
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Literature JSON:\n{literature}`,
  },
  novelty: {
    title: "Research Novelty Agent",
    instruction: `Given the topic "{topic}", literature review and identified gaps, assess the novelty of pursuing new work in this area.
ACCURACY & WORDING REQUIREMENTS:
- Treat novelty strictly as an AI-assisted research assessment based on the reviewed literature, NOT as an independently proven scientific fact.
- Avoid unnecessarily definitive wording such as "proven novelty", "established unique contribution", or "definitively novel".
- Use appropriately cautious wording such as "potential novelty", "proposed contribution", or "potentially distinctive direction".
- Do not present a numerical novelty score or "high novelty" as an established guarantee.
- Do not claim that the proposed research direction has already achieved the identified contribution or solved the problem.
Return JSON: {
  "novelty_score": 0-100,
  "innovation_summary": "2-3 sentence summary of what would be novel",
  "similar_existing_research": [{"paper_index": 1, "note": "how close it already is"}],
  "unique_contribution": "what a new project could uniquely offer",
  "possible_research_directions": ["direction 1", "direction 2"],
  "risks": ["risk of overlap or saturation"],
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Inputs:\nLiterature: {literature}\nGaps: {gaps}`,
  },
  roadmap: {
    title: "Research Roadmap Agent",
    instruction: `Given the topic "{topic}" and prior agent outputs, generate a structured research roadmap.
ACCURACY REQUIREMENTS:
- The roadmap represents PLANNED / PROPOSED future research phases (dataset acquisition, model development, training, experiments, benchmarking, statistical analysis, deployment, paper writing).
- Do not describe future activities or planned experiments as already completed.
Return JSON: {
  "phases": [
    {"phase": "Literature Review",          "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 2},
    {"phase": "Problem Identification",     "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 1},
    {"phase": "Research Gap",               "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 1},
    {"phase": "Dataset Selection",          "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 2},
    {"phase": "Algorithm Selection",        "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 2},
    {"phase": "Model Development",          "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 4},
    {"phase": "Evaluation Metrics",         "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 1},
    {"phase": "Experiment Design",          "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 2},
    {"phase": "Result Analysis",            "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 2},
    {"phase": "Paper Writing",              "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 3},
    {"phase": "Future Scope",               "objectives": ["..."], "deliverables": ["..."], "duration_weeks": 1}
  ],
  "milestones": ["..."],
  "total_duration_weeks": 21,
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Fill every phase with topic-specific detail. Inputs:\nLiterature: {literature}\nGaps: {gaps}\nMethodology: {methodology}`,
  },
  report: {
    title: "Report Generator",
    instruction: `Compile a final research report for topic "{topic}" using the prior agent outputs.
ACCURACY & CONSISTENCY REQUIREMENTS:
- Synthesize strictly across the validated prior agent outputs without contradicting available evidence.
- Ensure literature findings and research gaps are supported.
- Clearly distinguish proposed ideas and future methodologies from established findings. Do not strengthen a proposed research direction into a completed research result.
- For Conclusion: summarize what the literature establishes, describe the proposed approach as a proposed research direction, and do NOT call it "robust", "scalable", "validated", "proven", or "empirically successful" unless actual experimental evidence exists.
Return JSON: {
  "title": "Proposed working title",
  "executive_summary": "150-250 word executive summary for busy readers",
  "abstract": "200-300 word abstract",
  "introduction": "...",
  "literature_review": "synthesised prose, 4-6 paragraphs, weaving paper indices [1], [2]",
  "citation_list": ["APA-style entry per paper"],
  "research_gaps": "2-3 paragraphs",
  "proposed_methodology": "2-3 paragraphs grounded in the recommendation",
  "evidence_verification": "1-2 paragraphs summarising which claims are grounded and any unsupported ones",
  "confidence_analysis": "1 paragraph on overall confidence in these findings and why",
  "paper_comparison": "1-2 paragraphs summarising the comparison matrix",
  "novelty_analysis": "1-2 paragraphs on novelty of the direction",
  "research_roadmap": "1-2 paragraphs summarising the phased roadmap",
  "future_scope": "1-2 paragraphs",
  "conclusion": "1 paragraph summarizing literature findings and framing proposed work accurately as a proposed direction",
  "references": ["full APA reference per paper"],
  "keywords": ["..."],
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}
Inputs:
Literature: {literature}
Gaps: {gaps}
Methodology: {methodology}
Citations: {citations}
Evidence: {evidence}
Comparison: {comparison}
Novelty: {novelty}
Roadmap: {roadmap}`,
  },
};

interface LoadedPaper {
  id: string;
  file_name: string;
  storage_path: string;
  part: GeminiContentPart;
}

// Global maximum 15 papers validation
function validatePaperCount(papers: any[]): void {
  if (papers.length > 15) {
    throw new Error("Error: Maximum 15 research papers are allowed per run. Please remove the extra paper(s) and try again.");
  }
}

async function loadAllCurrentRunPapers(supabase: any, topicId: string): Promise<LoadedPaper[]> {
  const { data: papers, error } = await supabase
    .from("papers")
    .select("id, file_name, storage_path")
    .eq("topic_id", topicId)
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!papers?.length) return [];

  validatePaperCount(papers);

  const loaded: LoadedPaper[] = [];
  for (const p of papers) {
    const { data: blob, error: dlErr } = await supabase.storage.from("papers").download(p.storage_path);
    if (dlErr || !blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    const b64 = buf.toString("base64");
    loaded.push({
      id: p.id,
      file_name: p.file_name,
      storage_path: p.storage_path,
      part: pdfPart(p.file_name, b64),
    });
  }
  return loaded;
}

// Global Relevance Check before substantive processing
async function performRelevanceCheck(
  topicTitle: string,
  topicDescription: string,
  loadedPapers: LoadedPaper[]
): Promise<{
  allResults: PaperRelevanceItem[];
  relatedItems: PaperRelevanceItem[];
  notRelatedItems: PaperRelevanceItem[];
  relatedParts: GeminiContentPart[];
}> {
  if (loadedPapers.length === 0) {
    return { allResults: [], relatedItems: [], notRelatedItems: [], relatedParts: [] };
  }

  // Single paper case: Process single paper directly on its merits against the research topic without self-comparison
  if (loadedPapers.length === 1) {
    const singlePaper = loadedPapers[0];
    const promptText = `You are an academic peer reviewer evaluating a single uploaded research paper for a research run.
Research Topic Title: "${topicTitle}"
Research Topic Description: "${topicDescription || "N/A"}"

Attached is 1 research paper PDF (Filename: "${singlePaper.file_name}").

FINAL STRICT RELEVANCE CRITERIA (MINIMUM 2 SUBSTANTIVE CONNECTIONS RULE):
1. TITLE EXTRACTION: Extract the ACTUAL research paper title from the paper header or first page. If it cannot be reliably determined, use the uploaded filename "${singlePaper.file_name}". Never invent a title.
2. CONTENT EVALUATION: Evaluate the actual research content of the paper (title, abstract, introduction, research problem, objectives, methodology, architecture, techniques, applications, findings, contributions). Do NOT evaluate author names, uploader names, or filenames as evidence.
3. SUBSTANTIVE CONNECTION DIMENSIONS:
   Evaluate genuine positive research-level connections across dimensions such as:
   - Research domain / research area specific to the current topic
   - Specific research problem / challenge
   - Research objective
   - Core research concepts / lifecycle
   - Methodology / working approach
   - Specific techniques / algorithms / methods
   - Framework / architecture
   - Concrete application area
   - Meaningful new idea / development usefulness (a method/approach that can genuinely help develop, extend, solve, or improve the research)
   - Documented findings / contributions / proposed solution

4. STRICT THRESHOLD (MINIMUM 2 SUBSTANTIVE CONNECTIONS):
   - 2 or more genuine POSITIVE substantive connections → status: "related"
   - 0 or 1 genuine substantive connection → status: "not_related"

5. INTERNAL LOGICAL CONSISTENCY:
   - Never mark a paper as "related" if its supporting points or reasoning state that it has no domain alignment, no meaningful connection, no topical overlap, or does not address the research topic.
   - If the paper diverges or lacks substantive connections, you MUST set status to "not_related" and provide a concise reason explaining the divergence.
   - A paper marked "related" MUST have strictly positive supporting research points.

6. GENERIC TERMS EXCLUSION:
   Broad/generic terms (e.g. "AI", "Artificial Intelligence", "Machine Learning", "LLM", "framework", "automation", "software", "system", "technology", "data", "research", "knowledge", "platform", "algorithm") must NOT independently count as substantive connections or make a paper related without genuine domain/problem alignment.
7. Extract 3-5 academic keywords and a 1-2 sentence summary.

Return strict JSON:
{
  "papers": [
    {
      "index": 1,
      "file_name": "${singlePaper.file_name}",
      "title": "Exact Extracted Paper Title",
      "status": "related" | "not_related",
      "substantive_connections_count": 2,
      "substantive_connections": ["Specific positive connection 1...", "Specific positive connection 2..."],
      "reason": "...",
      "keywords": ["..."],
      "summary": "..."
    }
  ]
}`;

    let rawResults: any;
    try {
      rawResults = await callGeminiJSON<{ papers: PaperRelevanceItem[] }>({
        model: "google/gemini-3.5-flash-lite",
        messages: [
          {
            role: "system",
            content: "You are an expert academic evaluator. Respond ONLY with valid JSON matching the schema.",
          },
          { role: "user", content: [{ type: "text", text: promptText }, singlePaper.part] },
        ],
      });
    } catch (err) {
      console.warn("Relevance check error for single paper:", err);
      rawResults = {
        papers: [
          {
            index: 1,
            file_name: singlePaper.file_name,
            title: singlePaper.file_name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
            status: "not_related",
            substantive_connections_count: 0,
            substantive_connections: [],
            reason: "Evaluated for research topic.",
            keywords: [],
            summary: "",
          },
        ],
      };
    }

    const firstItem = rawResults?.papers?.[0];
    const isRelated = String(firstItem?.status || "").toLowerCase() === "related";
    const rawConns = Array.isArray(firstItem?.substantive_connections)
      ? firstItem.substantive_connections.map((c: any) => String(c).trim()).filter(Boolean)
      : [];
    const positiveConns = rawConns.filter((c: string) => !isNegativeOrNonAlignedStatement(c));
    const hasNegativeReason = isNegativeOrNonAlignedStatement(firstItem?.reason || "");
    const finalRelated = isRelated && !hasNegativeReason && positiveConns.length >= 2;

    const itemResult: PaperRelevanceItem = {
      index: 1,
      paper_id: singlePaper.id,
      file_name: singlePaper.file_name,
      title: firstItem?.title?.trim() || singlePaper.file_name,
      status: finalRelated ? "related" : "not_related",
      substantive_connections_count: finalRelated ? positiveConns.length : 0,
      substantive_connections: finalRelated ? positiveConns : [],
      reason:
        firstItem?.reason ||
        (finalRelated
          ? "Relevant with 2+ positive substantive research connections."
          : "None of the uploaded papers satisfied the required relevance criteria of a meaningful topic/domain connection and at least two distinct meaningful research-related supporting points."),
      keywords: Array.isArray(firstItem?.keywords) ? firstItem.keywords : [],
      summary: firstItem?.summary || "",
    };

    const allResults = [itemResult];
    const relatedItems = finalRelated ? [itemResult] : [];
    const notRelatedItems = finalRelated ? [] : [itemResult];
    const relatedParts = finalRelated ? [singlePaper.part] : [];

    return { allResults, relatedItems, notRelatedItems, relatedParts };
  }

  // 2–15 papers case: Independent paper-level evaluation and pairwise relationship discovery
  const paperListDescription = loadedPapers
    .map((p, i) => `[Paper ${i + 1}] Filename: "${p.file_name}"`)
    .join("\n");

  const promptText = `You are an academic peer reviewer performing an independent paper-by-paper relevance evaluation on ${loadedPapers.length} uploaded research papers for a research run.
Research Topic Title: "${topicTitle}"
Research Topic Description: "${topicDescription || "N/A"}"

Attached research paper PDFs:
${paperListDescription}

FINAL STRICT RELEVANCE RULE (MINIMUM 2 SUBSTANTIVE CONNECTIONS):
A paper must be classified as "related" ONLY when it has AT LEAST 2 GENUINE POSITIVE SUBSTANTIVE RESEARCH-LEVEL CONNECTIONS.
- If a paper has 0 or 1 genuine substantive connection → "not_related" / Out of Topic.
- If a paper has 2 or more genuine positive substantive connections → "related".

EVALUATION CRITERIA:
A paper qualifies as "related" if:
1. TOPIC ALIGNMENT: It has 2+ genuine positive substantive connections directly to the CURRENT research topic (domain, problem, objectives, methodology, techniques, application, or development usefulness);
OR
2. PAIRWISE RESEARCH RELATIONSHIP: It shares 2+ genuine positive substantive research-level connections (common domain, specific research problem, shared core concepts, compatible methodology/techniques, concrete framework, or direct application synergy) with AT LEAST ONE OTHER paper in the uploaded set.

SUBSTANTIVE CONNECTION DIMENSIONS:
- Research domain / research area specific to the current topic
- Specific research problem / challenge
- Research objective
- Core research concepts / lifecycle
- Methodology / working approach
- Concrete techniques / algorithms / methods
- Framework / architecture
- Specific application area
- Meaningful new idea / development usefulness (a method/approach that can genuinely help develop, extend, solve, or improve the research)
- Documented findings / contributions / proposed solution

CRITICAL RULES & CONSTRAINTS:
1. STRICT 2+ THRESHOLD: Exactly 1 weak or generic similarity (e.g. both mentioning "AI" or "framework") is NOT sufficient and MUST be classified as "not_related". Exactly 2 or more genuine positive connections MUST be classified as "related".
2. GENERIC KEYWORDS EXCLUSION: Broad terms such as "AI", "Artificial Intelligence", "Machine Learning", "LLM", "framework", "automation", "software", "system", "technology", "data", "algorithm", "research", "platform" do NOT independently count as substantive connections.
3. INTERNAL LOGICAL CONSISTENCY: Never mark a paper as "related" if its supporting points or reasoning describe no domain alignment, no meaningful connection, no topical overlap, or divergence from the research topic. If evidence shows no meaningful connection, status MUST be "not_related".
4. INDEPENDENT EVALUATION (NO ALL-OR-NOTHING GROUPING): Evaluate EACH paper independently based on its actual content against the current research topic.
5. NO TRANSITIVE PROPAGATION: If Paper A is related to Paper B, and Paper B is related to Paper C, Paper A is NOT related to Paper C unless A and C independently share 2+ substantive connections. Every paper must independently satisfy the 2+ substantive connection requirement.
6. SYMMETRIC RELATIONSHIPS: Paper-to-paper relationships are symmetric (A ↔ B). If Paper A shares 2+ connections with Paper B, list Paper B in A's related_to_indices AND Paper A in B's related_to_indices.
7. NO UPLOAD-ORDER OR METADATA BIAS: Array position, upload sequence, timestamp, author names, uploader names, or filenames have ZERO influence on relevance. Analyze actual paper content (title, abstract, introduction, problem, methodology, findings).
8. TITLE EXTRACTION: Extract the ACTUAL paper title from each PDF header/first page. Never invent a title.

For each paper:
- "index": 1-based index (matching attached PDF order)
- "file_name": the exact uploaded filename
- "title": extracted actual paper title
- "status": "related" OR "not_related"
- "substantive_connections_count": number of genuine positive substantive connections found (0, 1, 2, 3+)
- "substantive_connections": list of the genuine positive substantive connections found (leave empty [] if not_related)
- "related_to_indices": array of 1-based indices of other uploaded papers that this paper shares 2+ genuine positive substantive connections with (e.g. [2] or [])
- "reason": concise 1-2 sentence evidence-based explanation (explaining its 2+ positive substantive connections, or why it has 0-1 connections and is out of topic)
- "keywords": 3-5 academic keywords
- "summary": 1-2 sentence summary

Return strict JSON:
{
  "papers": [
    {
      "index": 1,
      "file_name": "filename.pdf",
      "title": "Exact Extracted Paper Title",
      "status": "related" | "not_related",
      "substantive_connections_count": 2,
      "substantive_connections": ["Shared domain: ...", "Shared methodology: ..."],
      "related_to_indices": [2],
      "reason": "...",
      "keywords": ["..."],
      "summary": "..."
    }
  ]
}`;

  const parts: GeminiContentPart[] = [
    { type: "text", text: promptText },
    ...loadedPapers.map((p) => p.part),
  ];

  let rawResults: any;
  try {
    rawResults = await callGeminiJSON<{ papers: PaperRelevanceItem[] }>({
      model: "google/gemini-3.5-flash-lite",
      messages: [
        {
          role: "system",
          content: "You are an expert academic evaluator. Respond ONLY with valid JSON matching the schema.",
        },
        { role: "user", content: parts },
      ],
    });
  } catch (err) {
    console.warn("Relevance check error, using fallback matching:", err);
    rawResults = {
      papers: loadedPapers.map((p, i) => ({
        index: i + 1,
        file_name: p.file_name,
        title: p.file_name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
        status: "not_related",
        substantive_connections_count: 0,
        substantive_connections: [],
        related_to_indices: [],
        reason: "Out of topic / unable to verify substantive connections.",
        keywords: [],
        summary: "",
      })),
    };
  }

  const rawList: any[] = Array.isArray(rawResults?.papers) ? rawResults.papers : [];
  
  // Step 1: Initial mapping from LLM response
  const preliminaryResults = loadedPapers.map((loadedPaper, idx) => {
    const match =
      rawList.find((item: any) => item.file_name === loadedPaper.file_name) ||
      rawList.find((item: any) => item.index === idx + 1) ||
      rawList[idx];

    const isRelated = String(match?.status || "").toLowerCase() === "related";
    const rawConns = Array.isArray(match?.substantive_connections)
      ? match.substantive_connections.map((c: any) => String(c).trim()).filter(Boolean)
      : [];
    const positiveConns = rawConns.filter((c: string) => !isNegativeOrNonAlignedStatement(c));
    const hasNegativeReason = isNegativeOrNonAlignedStatement(match?.reason || "");
    const qualifiesAsRelated = isRelated && !hasNegativeReason && positiveConns.length >= 2;

    const relatedIndices: number[] = Array.isArray(match?.related_to_indices)
      ? match.related_to_indices.filter(
          (n: any) => typeof n === "number" && n >= 1 && n <= loadedPapers.length && n !== idx + 1
        )
      : [];

    return {
      index: idx + 1,
      paper_id: loadedPaper.id,
      file_name: loadedPaper.file_name,
      title: match?.title?.trim() || loadedPaper.file_name,
      status: qualifiesAsRelated ? ("related" as const) : ("not_related" as const),
      substantive_connections_count: qualifiesAsRelated ? positiveConns.length : 0,
      substantive_connections: qualifiesAsRelated ? positiveConns : [],
      related_to_indices: relatedIndices,
      reason:
        match?.reason ||
        (qualifiesAsRelated
          ? "Relevant with 2+ positive substantive research connections."
          : "Out of topic / fewer than 2 positive substantive connections to the current topic."),
      keywords: Array.isArray(match?.keywords) ? match.keywords : [],
      summary: match?.summary || "",
    };
  });

  // Step 2: Symmetric Pairwise Consistency Enforcement (Non-transitive)
  // If paper i and paper j share 2+ substantive connections, both are "related"
  const finalRelated = preliminaryResults.map((p) => p.status === "related");
  for (let i = 0; i < preliminaryResults.length; i++) {
    for (const jIdx of preliminaryResults[i].related_to_indices) {
      const j = jIdx - 1;
      if (j >= 0 && j < preliminaryResults.length && j !== i) {
        if (preliminaryResults[i].status === "related" || preliminaryResults[j].status === "related") {
          finalRelated[i] = true;
          finalRelated[j] = true;
        }
      }
    }
  }

  const allResults: PaperRelevanceItem[] = preliminaryResults.map((p, idx) => {
    const isRel = finalRelated[idx];
    const conns = isRel ? p.substantive_connections : [];
    return {
      index: p.index,
      paper_id: p.paper_id,
      file_name: p.file_name,
      title: p.title,
      status: isRel ? "related" : "not_related",
      substantive_connections_count: isRel ? (conns?.length ?? 2) : 0,
      substantive_connections: isRel ? conns : [],
      reason: p.reason,
      keywords: p.keywords,
      summary: p.summary,
    };
  });

  const relatedItems = allResults.filter((r) => r.status === "related");
  const notRelatedItems = allResults.filter((r) => r.status === "not_related");

  // Keep only PDF parts belonging to Related papers
  const relatedPaperIds = new Set(relatedItems.map((r) => r.paper_id).filter(Boolean));
  const relatedFilenames = new Set(relatedItems.map((r) => r.file_name));
  const relatedParts = loadedPapers
    .filter((p) => relatedPaperIds.has(p.id) || relatedFilenames.has(p.file_name))
    .map((p) => p.part);

  return { allResults, relatedItems, notRelatedItems, relatedParts };
}

async function getLatestOutput(supabase: any, topicId: string, agent_type: AgentType) {
  const { data } = await supabase
    .from("agent_runs")
    .select("output")
    .eq("topic_id", topicId)
    .eq("agent_type", agent_type)
    .eq("status", "completed")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.output ?? null;
}

function formatAuthorsApa(authors: string[]): string {
  if (!authors || authors.length === 0) return "Author(s) unavailable";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors.slice(0, -1).join(", ")}, & ${authors[authors.length - 1]}`;
}

function formatAuthorsIeee(authors: string[]): string {
  if (!authors || authors.length === 0) return "";
  if (authors.length === 1) return `${authors[0]}, `;
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}, `;
  return `${authors.slice(0, -1).join(", ")}, and ${authors[authors.length - 1]}, `;
}

function formatAuthorsBibtex(authors: string[]): string {
  if (!authors || authors.length === 0) return "Unknown";
  return authors.join(" and ");
}

function generateCiteKey(title: string, authors: string[], year: number | string, index: number): string {
  const firstAuthor = authors && authors[0] ? authors[0].split(/\s+/).pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const firstWord = title.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") || `paper${index}`;
  const yr = String(year).replace(/[^0-9]/g, "") || "nd";
  return `${firstAuthor || firstWord}${yr}${firstAuthor ? `_${firstWord}` : ""}`.slice(0, 30);
}

function formatFallbackApa(meta: { title: string; authors: string[]; year: number | string; venue: string }): string {
  const authorStr = formatAuthorsApa(meta.authors);
  const yrStr = meta.year && meta.year !== "n.d." ? `(${meta.year})` : "(n.d.)";
  const cleanTitle = meta.title.replace(/\.$/, "");
  const venueStr = meta.venue ? ` ${meta.venue}.` : "";
  return `${authorStr} ${yrStr}. ${cleanTitle}.${venueStr}`;
}

function formatFallbackIeee(meta: { title: string; authors: string[]; year: number | string; venue: string }, index: number): string {
  const authorStr = formatAuthorsIeee(meta.authors);
  const cleanTitle = meta.title.replace(/\.$/, "");
  const venueStr = meta.venue || "Academic Publication";
  const yrStr = meta.year && meta.year !== "n.d." ? `, ${meta.year}` : "";
  return `[${index}] ${authorStr}"${cleanTitle}," ${venueStr}${yrStr}.`;
}

function formatFallbackBibtex(meta: { title: string; authors: string[]; year: number | string; venue: string }, index: number): string {
  const citeKey = generateCiteKey(meta.title, meta.authors, meta.year, index);
  const cleanTitle = meta.title.replace(/[\{\}]/g, "");
  const authorStr = formatAuthorsBibtex(meta.authors);
  const venueStr = meta.venue || "Academic Publication";
  const yrStr = meta.year ? String(meta.year) : "n.d.";
  return `@article{${citeKey},\n  title = {${cleanTitle}},\n  author = {${authorStr}},\n  journal = {${venueStr}},\n  year = {${yrStr}}\n}`;
}

function extractRelevantPapersMeta(
  relatedItems: PaperRelevanceItem[],
  literatureOutput: any
): Array<{
  index: number;
  original_index: number;
  title: string;
  authors: string[];
  year: number | string;
  venue: string;
  file_name: string;
  summary: string;
}> {
  const litPapers: any[] = Array.isArray(literatureOutput?.papers) ? literatureOutput.papers : [];

  return relatedItems.map((item, idx) => {
    const normalizedItemTitle = (item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const matchingLitPaper =
      litPapers.find((lp: any) => {
        const normLpTitle = (lp?.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normLpTitle &&
          (normLpTitle === normalizedItemTitle ||
            normLpTitle.includes(normalizedItemTitle) ||
            normalizedItemTitle.includes(normLpTitle))
        );
      }) ||
      litPapers.find((lp: any) => lp?.index === item.index) ||
      (litPapers.length === relatedItems.length ? litPapers[idx] : undefined);

    const title =
      matchingLitPaper?.title?.trim() ||
      item.title?.trim() ||
      item.file_name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    const authors =
      Array.isArray(matchingLitPaper?.authors) && matchingLitPaper.authors.length > 0
        ? matchingLitPaper.authors.map(String).map((a: string) => a.trim()).filter(Boolean)
        : typeof matchingLitPaper?.authors === "string" && matchingLitPaper.authors.trim()
        ? matchingLitPaper.authors.split(/,\s*|\s+and\s+/i).map((a: string) => a.trim()).filter(Boolean)
        : [];

    let year: number | string = matchingLitPaper?.year ?? "";
    if (!year || isNaN(Number(year))) {
      const yearMatch = (item.file_name + " " + title).match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) {
        year = parseInt(yearMatch[0], 10);
      } else {
        year = "";
      }
    } else {
      year = Number(year);
    }

    const venue = matchingLitPaper?.venue?.trim() || "";

    return {
      index: idx + 1,
      original_index: item.index,
      title,
      authors: authors.length > 0 ? authors : ["Author(s) Unavailable"],
      year: year || "n.d.",
      venue: venue || "Academic Publication",
      file_name: item.file_name,
      summary: matchingLitPaper?.summary || item.summary || "",
    };
  });
}

// Agents that need direct access to the source PDFs
const PDF_AGENTS: AgentType[] = ["literature", "evidence"];

export const runAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ topic_id: z.string().uuid(), agent_type: AgentTypeSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; run_id: string; output: any }> => {
    const { supabase, userId } = context;

    const { data: topic, error: tErr } = await supabase
      .from("topics")
      .select("title, description")
      .eq("id", data.topic_id)
      .maybeSingle();
    if (tErr || !topic) throw new Error("Topic not found");

    // Check paper count and enforce strict global limit (Max 15)
    const { data: rawPapers, error: pCountErr } = await supabase
      .from("papers")
      .select("id, file_name, storage_path")
      .eq("topic_id", data.topic_id);
    if (pCountErr) throw new Error(pCountErr.message);

    if (!rawPapers || rawPapers.length === 0) {
      throw new Error("Upload at least one PDF before running this agent.");
    }

    validatePaperCount(rawPapers);

    const { data: run, error: runErr } = await supabase
      .from("agent_runs")
      .insert({
        topic_id: data.topic_id,
        user_id: userId,
        agent_type: data.agent_type,
        status: "running",
      })
      .select()
      .single();
    if (runErr) throw new Error(runErr.message);

    try {
      const loaded = await loadAllCurrentRunPapers(supabase, data.topic_id);

      // Step 1: Perform or retrieve global relevance check
      let relevanceCheck: PaperRelevanceItem[] = [];
      let relatedItems: PaperRelevanceItem[] = [];
      let notRelatedItems: PaperRelevanceItem[] = [];
      let relatedParts: GeminiContentPart[] = [];

      // Check if literature agent output already contains relevance check for current papers
      const existingLitOutput: any = await getLatestOutput(supabase, data.topic_id, "literature");
      if (
        data.agent_type !== "literature" &&
        Array.isArray(existingLitOutput?.relevance_check) &&
        existingLitOutput.relevance_check.length === rawPapers.length
      ) {
        relevanceCheck = existingLitOutput.relevance_check;
        relatedItems = relevanceCheck.filter((r) => r.status === "related");
        notRelatedItems = relevanceCheck.filter((r) => r.status === "not_related");

        if (PDF_AGENTS.includes(data.agent_type)) {
          const relIds = new Set(relatedItems.map((r) => r.paper_id).filter(Boolean));
          const relNames = new Set(relatedItems.map((r) => r.file_name));
          relatedParts = loaded
            .filter((p) => relIds.has(p.id) || relNames.has(p.file_name))
            .map((p) => p.part);
        }
      } else {
        const relResult = await performRelevanceCheck(topic.title, topic.description || "", loaded);
        relevanceCheck = relResult.allResults;
        relatedItems = relResult.relatedItems;
        notRelatedItems = relResult.notRelatedItems;
        relatedParts = relResult.relatedParts;
      }

      // Determine processing sources based on relevance check:
      // - If 1+ related papers: process ALL related papers collectively (excluding not_related papers)
      // - If 0 related papers: ZERO-RELATED FALLBACK protocol:
      //   Keep all papers as "not_related" in relevance_check, and use ONLY the first uploaded paper (loaded[0])
      //   strictly as a fallback processing source.
      const isZeroRelatedFallback = relatedItems.length === 0 && loaded.length > 0;
      const processingParts: GeminiContentPart[] = isZeroRelatedFallback
        ? [loaded[0].part]
        : relatedParts;

      // Step 2: Prepare prompt and prior outputs
      // Special dedicated handling for Citation Agent:
      // Must generate citations for ALL validated relevant papers with consistent numbering and metadata
      if (data.agent_type === "citation") {
        const literatureOutput: any = await getLatestOutput(supabase, data.topic_id, "literature");
        if (!literatureOutput) throw new Error("Run the Literature Review Agent first.");

        const relevantPapers = extractRelevantPapersMeta(relatedItems, literatureOutput);

        if (relevantPapers.length === 0) {
          const output: any = {
            apa: [],
            ieee: [],
            bibtex: [],
            confidence: {
              score: 95,
              level: "high",
              rationale: "No uploaded papers satisfied the relevance criteria; no citations generated for irrelevant papers.",
            },
            relevance_check: relevanceCheck,
          };
          if (isZeroRelatedFallback) {
            output.is_zero_related_fallback = true;
          }
          await supabase
            .from("agent_runs")
            .update({ status: "completed", output, finished_at: new Date().toISOString() })
            .eq("id", run.id);
          return { ok: true, run_id: run.id, output };
        }

        const relevantPapersListText = relevantPapers
          .map(
            (p) =>
              `[Paper ${p.index} (Upload [${p.original_index}])]
Title: ${p.title}
Authors: ${p.authors.join(", ")}
Year: ${p.year}
Venue: ${p.venue}
Filename: ${p.file_name}
Summary: ${p.summary}`
          )
          .join("\n\n");

        const citationPrompt = `You are the Citation Agent. Generate complete academic citations in APA 7th edition, IEEE, and BibTeX formats for ALL ${relevantPapers.length} validated relevant research papers listed below.

TOPIC: "${topic.title}"
TOTAL VALIDATED RELEVANT PAPERS: ${relevantPapers.length}

VALIDATED RELEVANT PAPERS LIST:
${relevantPapersListText}

REQUIREMENTS:
1. You MUST generate citation entries for ALL ${relevantPapers.length} validated relevant papers.
2. "apa": Array of EXACTLY ${relevantPapers.length} APA 7 citation strings, one for each paper in sequential order (Paper 1 to Paper ${relevantPapers.length}).
3. "ieee": Array of EXACTLY ${relevantPapers.length} IEEE citation strings numbered [1] to [${relevantPapers.length}], one for each paper in sequential order.
4. "bibtex": Array of EXACTLY ${relevantPapers.length} BibTeX entries (@article{...} or @inproceedings{...}), one for each paper in sequential order.
5. Do NOT skip any relevant paper. If 2 relevant papers are provided, generate citations for both. If 15 relevant papers are provided, generate citations for all 15.
6. Do NOT generate citations for irrelevant papers or papers outside this list.
7. Use the actual metadata provided above. Do not fabricate authors, venues, or years.

Return strict, valid JSON:
{
  "apa": [
    "APA 7 entry for Paper 1",
    "APA 7 entry for Paper 2"
  ],
  "ieee": [
    "[1] IEEE entry for Paper 1",
    "[2] IEEE entry for Paper 2"
  ],
  "bibtex": [
    "@article{...}",
    "@article{...}"
  ],
  "confidence": {"score": 0-100, "level": "low|medium|high", "rationale": "..."}
}`;

        const userContent: GeminiContentPart[] = [{ type: "text", text: citationPrompt }];

        let rawOutput: any;
        try {
          rawOutput = await callGeminiJSON({
            model: "google/gemini-3.5-flash-lite",
            messages: [
              { role: "system", content: SYSTEM_BASE },
              { role: "user", content: userContent },
            ],
          });
        } catch (callErr) {
          console.warn("Citation generation error from AI model, using fallback citation builder:", callErr);
          rawOutput = {
            apa: [],
            ieee: [],
            bibtex: [],
            confidence: {
              score: 85,
              level: "medium",
              rationale: "Citations generated from validated paper metadata.",
            },
          };
        }

        const output: any = {
          apa: Array.isArray(rawOutput?.apa) ? rawOutput.apa : [],
          ieee: Array.isArray(rawOutput?.ieee) ? rawOutput.ieee : [],
          bibtex: Array.isArray(rawOutput?.bibtex) ? rawOutput.bibtex : [],
          confidence: rawOutput?.confidence || {
            score: 90,
            level: "high",
            rationale: "Citations verified against validated relevant research papers.",
          },
        };

        // Post-processing to guarantee 100% coverage and consistent numbering across all relevant papers
        for (let i = 0; i < relevantPapers.length; i++) {
          const paper = relevantPapers[i];
          const expectedNum = i + 1;

          // APA
          if (!output.apa[i] || typeof output.apa[i] !== "string" || !output.apa[i].trim()) {
            output.apa[i] = formatFallbackApa(paper);
          }

          // IEEE
          if (!output.ieee[i] || typeof output.ieee[i] !== "string" || !output.ieee[i].trim()) {
            output.ieee[i] = formatFallbackIeee(paper, expectedNum);
          } else {
            const strippedIeee = output.ieee[i].replace(/^\[\d+\]\s*/, "").trim();
            output.ieee[i] = `[${expectedNum}] ${strippedIeee}`;
          }

          // BibTeX
          if (!output.bibtex[i] || typeof output.bibtex[i] !== "string" || !output.bibtex[i].trim()) {
            output.bibtex[i] = formatFallbackBibtex(paper, expectedNum);
          }
        }

        // Trim any excess entries beyond relevantPapers.length
        output.apa = output.apa.slice(0, relevantPapers.length);
        output.ieee = output.ieee.slice(0, relevantPapers.length);
        output.bibtex = output.bibtex.slice(0, relevantPapers.length);

        output.relevance_check = relevanceCheck;
        if (isZeroRelatedFallback) {
          output.is_zero_related_fallback = true;
        }

        await supabase
          .from("agent_runs")
          .update({ status: "completed", output, finished_at: new Date().toISOString() })
          .eq("id", run.id);

        return { ok: true, run_id: run.id, output };
      }

      const prompt = PROMPTS[data.agent_type];
      let instruction = prompt.instruction.replace(/\{topic\}/g, topic.title);
      const userContent: GeminiContentPart[] = [];

      // Load prior outputs on demand
      const needsLiterature: AgentType[] = ["gap", "methodology", "evidence", "comparison", "novelty", "roadmap", "report"];
      let literature: unknown = null;
      let gaps: unknown = null;
      let methodology: unknown = null;
      let citations: unknown = null;
      let evidence: unknown = null;
      let comparison: unknown = null;
      let novelty: unknown = null;
      let roadmap: unknown = null;

      if (needsLiterature.includes(data.agent_type)) {
        literature = await getLatestOutput(supabase, data.topic_id, "literature");
        if (!literature) throw new Error("Run the Literature Review Agent first.");
      }
      if (["methodology", "novelty", "roadmap", "report", "evidence"].includes(data.agent_type)) {
        gaps = await getLatestOutput(supabase, data.topic_id, "gap");
        if (!gaps && data.agent_type !== "evidence") throw new Error("Run the Research Gap Agent first.");
      }
      if (["roadmap", "report"].includes(data.agent_type)) {
        methodology = await getLatestOutput(supabase, data.topic_id, "methodology");
        if (!methodology) throw new Error("Run the Methodology Agent first.");
      }
      if (data.agent_type === "report") {
        citations = await getLatestOutput(supabase, data.topic_id, "citation");
        evidence = await getLatestOutput(supabase, data.topic_id, "evidence");
        comparison = await getLatestOutput(supabase, data.topic_id, "comparison");
        novelty = await getLatestOutput(supabase, data.topic_id, "novelty");
        roadmap = await getLatestOutput(supabase, data.topic_id, "roadmap");
      }

      instruction = instruction
        .replace("{literature}", JSON.stringify(literature ?? {}, null, 2))
        .replace("{gaps}", JSON.stringify(gaps ?? {}, null, 2))
        .replace("{methodology}", JSON.stringify(methodology ?? {}, null, 2))
        .replace("{citations}", JSON.stringify(citations ?? {}, null, 2))
        .replace("{evidence}", JSON.stringify(evidence ?? {}, null, 2))
        .replace("{comparison}", JSON.stringify(comparison ?? {}, null, 2))
        .replace("{novelty}", JSON.stringify(novelty ?? {}, null, 2))
        .replace("{roadmap}", JSON.stringify(roadmap ?? {}, null, 2));

      if (PDF_AGENTS.includes(data.agent_type)) {
        userContent.push({ type: "text", text: instruction });
        userContent.push(...processingParts);
      } else {
        userContent.push({ type: "text", text: instruction });
      }

      const output: any = await callGeminiJSON({
        model: "google/gemini-3.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_BASE },
          { role: "user", content: userContent },
        ],
      });

      // Attach global relevance check to the agent's output
      output.relevance_check = relevanceCheck;
      if (isZeroRelatedFallback) {
        output.is_zero_related_fallback = true;
      }

      // Special handling for Literature Review Agent:
      // Fetch verified external academic papers across combined research context
      if (data.agent_type === "literature") {
        const relatedContexts: RelatedPaperContext[] = isZeroRelatedFallback
          ? [
              {
                title: relevanceCheck[0]?.title || loaded[0].file_name,
                file_name: loaded[0].file_name,
                summary: relevanceCheck[0]?.summary || "",
                keywords: relevanceCheck[0]?.keywords || [],
              },
            ]
          : relatedItems.map((r) => ({
              title: r.title,
              file_name: r.file_name,
              summary: r.summary,
              keywords: r.keywords,
            }));

        try {
          const similarPapers = await fetchSimilarAcademicPapers(
            topic.title,
            topic.description || "",
            relatedContexts,
            async (paper, contextText) => {
              const res = await callGeminiJSON<{
                is_relevant: boolean;
                why_relevant: string;
                supporting_points: string[];
              }>({
                model: "google/gemini-3.5-flash-lite",
                messages: [
                  {
                    role: "system",
                    content:
                      `You are an expert academic evaluator. Evaluate whether the candidate external research paper has genuine relevance to the current research topic and context using the strict relevance criteria:
1. Meaningful topic/domain connection to the CURRENT research topic.
2. At least TWO DISTINCT, POSITIVE, SUBSTANTIVE research-level connections supported by actual candidate paper content (e.g., domain alignment, shared methodology, specific dataset, algorithmic synergy, or research problem).
3. Generic keyword matches alone (e.g. "AI", "framework", "LLM", "system") MUST be rejected.
4. Internal Logical Consistency: If the paper diverges, has no domain alignment, or lacks 2+ positive substantive connections, you MUST set "is_relevant": false and "supporting_points": []. NEVER generate negative statements as supporting points for a relevant paper.
Return strict, valid JSON:
{
  "is_relevant": boolean,
  "why_relevant": "concise explanation of positive research alignment, or concise reason why out of topic",
  "supporting_points": ["Specific positive connection 1...", "Specific positive connection 2..."]
}`,
                  },
                  {
                    role: "user",
                    content: `Combined Research Context:\n${contextText}\n\nCandidate External Paper:\nTitle: ${paper.title}\nAuthors: ${paper.authors.join(", ")}\nYear: ${paper.year}\nVenue: ${paper.venue}`,
                  },
                ],
              });
              return res ?? { is_relevant: false, why_relevant: "", supporting_points: [] };
            }
          );
          output.similar_papers = similarPapers;
        } catch (simErr) {
          console.warn("Failed to fetch similar papers:", simErr);
          output.similar_papers = [];
        }
      }

      await supabase
        .from("agent_runs")
        .update({ status: "completed", output, finished_at: new Date().toISOString() })
        .eq("id", run.id);

      if (data.agent_type === "report") {
        await supabase.from("reports").insert({
          topic_id: data.topic_id,
          user_id: userId,
          content: output,
        });
      }

      return { ok: true, run_id: run.id, output };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
        .eq("id", run.id);
      throw new Error(msg);
    }
  });

export const runAllAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ topic_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context: _ctx }): Promise<{ ok: true; results: Record<string, any> }> => {
    const sequence: AgentType[] = [
      "literature",
      "citation",
      "gap",
      "evidence",
      "comparison",
      "methodology",
      "novelty",
      "roadmap",
      "report",
    ];
    const results: Record<string, any> = {};
    for (const agent of sequence) {
      const res = await runAgent({ data: { topic_id: data.topic_id, agent_type: agent } });
      results[agent] = res.output;
    }
    return { ok: true, results };
  });
