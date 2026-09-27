import type { Json } from "@/integrations/supabase/types";

export type RecommendedAcademicPaper = {
  [key: string]: Json | undefined;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  why_relevant: string;
  supporting_points?: string[];
  url: string;
  doi?: string;
};

export interface RelatedPaperContext {
  title: string;
  file_name: string;
  summary?: string;
  keywords?: string[];
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// Fetch from Semantic Scholar Graph API
async function searchSemanticScholar(query: string, limit = 20): Promise<RecommendedAcademicPaper[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,year,venue,publicationVenue,abstract,externalIds,url,openAccessPdf`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AtelierResearchPlatform/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!Array.isArray(data?.data)) return [];

    const papers: RecommendedAcademicPaper[] = [];
    for (const p of data.data) {
      if (!p.title) continue;
      const authors = Array.isArray(p.authors)
        ? p.authors.map((a: any) => a.name).filter(Boolean)
        : [];
      const venue = p.publicationVenue?.name || p.venue || "Academic Publication";
      const doi = p.externalIds?.DOI;
      const arxiv = p.externalIds?.ArXiv;
      
      // Real verified clickable link
      let paperUrl = "";
      if (doi) {
        paperUrl = `https://doi.org/${doi}`;
      } else if (arxiv) {
        paperUrl = `https://arxiv.org/abs/${arxiv}`;
      } else if (p.url) {
        paperUrl = p.url;
      } else if (p.openAccessPdf?.url) {
        paperUrl = p.openAccessPdf.url;
      }

      if (!paperUrl) continue;

      papers.push({
        title: p.title.trim(),
        authors: authors.length > 0 ? authors : ["Unknown Authors"],
        year: p.year ?? null,
        venue,
        why_relevant: "",
        url: paperUrl,
        doi: doi || undefined,
      });
    }
    return papers;
  } catch (err) {
    console.warn("Semantic Scholar API search error:", err);
    return [];
  }
}

// Fetch from CrossRef API as high-reliability fallback
async function searchCrossRef(query: string, limit = 20): Promise<RecommendedAcademicPaper[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=title,author,published,container-title,DOI,URL,publisher`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AtelierResearchPlatform/1.0 (mailto:research@atelier.local)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const items = data?.message?.items;
    if (!Array.isArray(items)) return [];

    const papers: RecommendedAcademicPaper[] = [];
    for (const item of items) {
      const rawTitle = Array.isArray(item.title) ? item.title[0] : item.title;
      if (!rawTitle) continue;
      const title = String(rawTitle).trim();
      const authors = Array.isArray(item.author)
        ? item.author.map((a: any) => `${a.given || ""} ${a.family || ""}`.trim()).filter(Boolean)
        : [];
      const venue = (Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"]) || item.publisher || "Academic Publication";
      const year = item.published?.["date-parts"]?.[0]?.[0] ?? null;
      const doi = item.DOI;
      const paperUrl = doi ? `https://doi.org/${doi}` : item.URL;

      if (!paperUrl) continue;

      papers.push({
        title,
        authors: authors.length > 0 ? authors : ["Unknown Authors"],
        year: typeof year === "number" ? year : null,
        venue: String(venue),
        why_relevant: "",
        url: paperUrl,
        doi: doi || undefined,
      });
    }
    return papers;
  } catch (err) {
    console.warn("CrossRef API search error:", err);
    return [];
  }
}

// Fetch from OpenAlex API
async function searchOpenAlex(query: string, limit = 20): Promise<RecommendedAcademicPaper[]> {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&select=id,doi,title,publication_year,primary_location,authorships`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AtelierResearchPlatform/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const results = data?.results;
    if (!Array.isArray(results)) return [];

    const papers: RecommendedAcademicPaper[] = [];
    for (const item of results) {
      if (!item.title) continue;
      const authors = Array.isArray(item.authorships)
        ? item.authorships.map((a: any) => a.author?.display_name).filter(Boolean)
        : [];
      const venue = item.primary_location?.source?.display_name || "Academic Journal / Conference";
      const doi = item.doi ? item.doi.replace(/^https?:\/\/doi\.org\//i, "") : undefined;
      const paperUrl = item.doi || item.primary_location?.landing_page_url || item.id;

      if (!paperUrl) continue;

      papers.push({
        title: item.title.trim(),
        authors: authors.length > 0 ? authors : ["Unknown Authors"],
        year: typeof item.publication_year === "number" ? item.publication_year : null,
        venue: String(venue),
        why_relevant: "",
        url: paperUrl,
        doi,
      });
    }
    return papers;
  } catch (err) {
    console.warn("OpenAlex API search error:", err);
    return [];
  }
}

export function isNegativeOrNonAlignedStatement(text: string): boolean {
  if (!text || typeof text !== "string") return true;
  const lower = text.toLowerCase();
  const negativePatterns = [
    "no domain alignment",
    "no meaningful connection",
    "no topical overlap",
    "no methodological synergy",
    "does not address",
    "does not align",
    "diverges from",
    "diverging from",
    "no intersection",
    "no connection",
    "not aligned",
    "not related",
    "out of topic",
    "lacks connection",
    "lack of connection",
    "insufficient connection",
    "unrelated",
    "fewer than 2",
    "less than 2",
    "no substantive",
    "without substantive",
    "cannot support",
    "divergent domain",
    "not relevant",
    "no research-level connection",
    "no overlap",
    "does not support",
    "no direct connection",
    "no direct link",
  ];
  return negativePatterns.some((pattern) => lower.includes(pattern));
}

export async function fetchSimilarAcademicPapers(
  topicTitle: string,
  topicDescription: string,
  relatedPapers: RelatedPaperContext[],
  evaluateRelevanceFn: (
    paper: RecommendedAcademicPaper,
    combinedContext: string
  ) => Promise<{ is_relevant?: boolean; why_relevant?: string; supporting_points?: string[] }>
): Promise<RecommendedAcademicPaper[]> {
  if (relatedPapers.length === 0) return [];

  // Build combined queries from all related papers
  const uploadedTitles = relatedPapers.map((p) => p.title).filter(Boolean);
  const uploadedFilenames = relatedPapers.map((p) => p.file_name).filter(Boolean);
  const uploadedKeywords = relatedPapers.flatMap((p) => p.keywords || []).filter(Boolean);
  const uploadedNormTitles = new Set([
    ...uploadedTitles.map(normalizeTitle),
    ...uploadedFilenames.map(normalizeTitle),
  ]);

  // Generate diverse focused search queries representing different facets of the research context
  const query1 = topicTitle.trim();
  const query2 = `${topicTitle} ${uploadedKeywords.slice(0, 3).join(" ")}`.trim();
  const query3 = uploadedKeywords.length > 3 ? `${topicTitle} ${uploadedKeywords.slice(3, 7).join(" ")}`.trim() : "";
  const query4 = uploadedTitles.length > 0 ? `${topicTitle} ${uploadedTitles[0]}`.slice(0, 150).trim() : "";
  const query5 = uploadedTitles.length > 1 ? `${topicTitle} ${uploadedTitles[1]}`.slice(0, 150).trim() : "";

  // Search across multiple academic APIs in parallel with high candidate limits
  const [ss1, ss2, ss3, cr1, cr2, oa1, oa2] = await Promise.all([
    searchSemanticScholar(query1, 25),
    query2 ? searchSemanticScholar(query2, 25) : Promise.resolve([]),
    query4 ? searchSemanticScholar(query4, 20) : Promise.resolve([]),
    searchCrossRef(query1, 25),
    query2 ? searchCrossRef(query2, 25) : Promise.resolve([]),
    searchOpenAlex(query1, 25),
    query2 ? searchOpenAlex(query2, 25) : Promise.resolve([]),
  ]);

  const rawCandidates = [...ss1, ...ss2, ...ss3, ...cr1, ...cr2, ...oa1, ...oa2];

  // Deduplicate and filter out uploaded papers
  const seenUrls = new Set<string>();
  const seenDois = new Set<string>();
  const seenTitles = new Set<string>();
  const uniqueCandidates: RecommendedAcademicPaper[] = [];

  for (const paper of rawCandidates) {
    const norm = normalizeTitle(paper.title);
    if (!norm || norm.length < 5) continue;

    // Check if paper matches one of the user's uploaded papers
    if (uploadedNormTitles.has(norm)) continue;
    let matchesUploaded = false;
    for (const upNorm of uploadedNormTitles) {
      if (upNorm.length > 10 && (norm.includes(upNorm) || upNorm.includes(norm))) {
        matchesUploaded = true;
        break;
      }
    }
    if (matchesUploaded) continue;

    // Deduplicate by title
    if (seenTitles.has(norm)) continue;
    seenTitles.add(norm);

    if (paper.doi) {
      const cleanDoi = paper.doi.toLowerCase().trim();
      if (seenDois.has(cleanDoi)) continue;
      seenDois.add(cleanDoi);
    }

    if (paper.url) {
      const cleanUrl = paper.url.toLowerCase().trim();
      if (seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);
    }

    uniqueCandidates.push(paper);
    if (uniqueCandidates.length >= 60) break;
  }

  // If initial search produced fewer than 30 candidates, query secondary angles
  if (uniqueCandidates.length < 30 && (query3 || query5)) {
    const [extraCr, extraOa] = await Promise.all([
      query3 ? searchCrossRef(query3, 20) : Promise.resolve([]),
      query5 ? searchOpenAlex(query5, 20) : Promise.resolve([]),
    ]);
    for (const paper of [...extraCr, ...extraOa]) {
      const norm = normalizeTitle(paper.title);
      if (!norm || norm.length < 5 || seenTitles.has(norm) || uploadedNormTitles.has(norm)) continue;
      seenTitles.add(norm);
      if (paper.doi) seenDois.add(paper.doi.toLowerCase().trim());
      if (paper.url) seenUrls.add(paper.url.toLowerCase().trim());
      uniqueCandidates.push(paper);
      if (uniqueCandidates.length >= 60) break;
    }
  }

  if (uniqueCandidates.length === 0) return [];

  // Generate research context for candidate evaluation
  const combinedContextText = `Research Topic: ${topicTitle}\nTopic Description: ${topicDescription || "N/A"}\nRelated Uploaded Papers:\n` +
    relatedPapers.map((p, i) => `[${i + 1}] "${p.title}" (Keywords: ${(p.keywords || []).join(", ") || "N/A"})`).join("\n");

  // Validate candidate papers strictly against the 2+ substantive connection rule
  const validatedPapers: RecommendedAcademicPaper[] = [];
  for (const paper of uniqueCandidates) {
    try {
      const evalRes = await evaluateRelevanceFn(paper, combinedContextText);
      const rawPoints = Array.isArray(evalRes?.supporting_points)
        ? evalRes.supporting_points.map((pt) => String(pt).trim()).filter(Boolean)
        : [];
      
      const positivePoints = rawPoints.filter((pt) => !isNegativeOrNonAlignedStatement(pt));
      const hasNegativeReason = isNegativeOrNonAlignedStatement(evalRes?.why_relevant || "");
      const isRel = evalRes?.is_relevant === true && !hasNegativeReason && positivePoints.length >= 2;

      // Strict requirement: At least 2 distinct meaningful positive research-related points
      if (isRel && positivePoints.length >= 2) {
        validatedPapers.push({
          ...paper,
          why_relevant: evalRes?.why_relevant || positivePoints.join(". "),
          supporting_points: positivePoints,
        });
      }

      // Stop once 15 genuinely relevant papers are validated
      if (validatedPapers.length >= 15) break;
    } catch (err) {
      console.warn("Failed to evaluate candidate paper relevance:", err);
    }
  }

  return validatedPapers;
}
