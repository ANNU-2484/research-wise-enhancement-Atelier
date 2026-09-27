import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

type ReportContent = {
  title?: string;
  executive_summary?: string;
  abstract?: string;
  introduction?: string;
  literature_review?: string;
  citation_list?: string[];
  research_gaps?: string;
  proposed_methodology?: string;
  evidence_verification?: string;
  confidence_analysis?: string;
  paper_comparison?: string;
  novelty_analysis?: string;
  research_roadmap?: string;
  future_scope?: string;
  conclusion?: string;
  references?: string[];
  keywords?: string[];
};

const SECTIONS: { key: keyof ReportContent; label: string }[] = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "abstract", label: "Abstract" },
  { key: "introduction", label: "1. Introduction" },
  { key: "literature_review", label: "2. Literature Review" },
  { key: "research_gaps", label: "3. Research Gaps" },
  { key: "proposed_methodology", label: "4. Proposed Methodology" },
  { key: "evidence_verification", label: "5. Evidence Verification" },
  { key: "confidence_analysis", label: "6. Confidence Analysis" },
  { key: "paper_comparison", label: "7. Paper Comparison" },
  { key: "novelty_analysis", label: "8. Novelty Analysis" },
  { key: "research_roadmap", label: "9. Research Roadmap" },
  { key: "future_scope", label: "10. Future Scope" },
  { key: "conclusion", label: "11. Conclusion" },
];

const LIST_SECTIONS: { key: "citation_list" | "references"; label: string }[] = [
  { key: "citation_list", label: "Citations" },
  { key: "references", label: "References" },
];

export function exportReportPdf(topicTitle: string, content: any) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 64;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const textW = pageW - marginX * 2;
  let y = 72;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - 72) { doc.addPage(); y = 72; }
  };

  doc.setFont("times", "bold");
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(content.title || topicTitle, textW);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 24 + 8;

  if (content.keywords?.length) {
    doc.setFont("times", "italic");
    doc.setFontSize(10);
    const kw = "Keywords: " + content.keywords.join(", ");
    const kwLines = doc.splitTextToSize(kw, textW);
    doc.text(kwLines, marginX, y);
    y += kwLines.length * 14 + 12;
  }

  const writeSection = (label: string, body: string) => {
    ensureSpace(28);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text(label, marginX, y);
    y += 18;
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    const paragraphs = String(body).split(/\n+/).filter(Boolean);
    for (const p of paragraphs) {
      const lines = doc.splitTextToSize(p, textW);
      ensureSpace(lines.length * 14 + 4);
      doc.text(lines, marginX, y);
      y += lines.length * 14 + 8;
    }
    y += 4;
  };

  for (const s of SECTIONS) {
    const body = content[s.key];
    if (!body) continue;
    writeSection(s.label, String(body));
  }

  for (const s of LIST_SECTIONS) {
    const list = content[s.key];
    if (!Array.isArray(list) || list.length === 0) continue;
    writeSection(s.label, list.map((r: string, i: number) => `[${i + 1}] ${r}`).join("\n"));
  }

  if (content.confidence?.score != null) {
    writeSection(
      "Overall Confidence",
      `${content.confidence.level ?? ""} — ${content.confidence.score}%\n${content.confidence.rationale ?? ""}`,
    );
  }

  doc.save(`${slug(topicTitle)}-report.pdf`);
}

export async function exportReportDocx(topicTitle: string, content: any) {
  const children: Paragraph[] = [];
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: content.title || topicTitle, bold: true, size: 36 })],
  }));
  if (content.keywords?.length) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Keywords: " + content.keywords.join(", "), italics: true, size: 20 })],
    }));
  }
  children.push(new Paragraph({ children: [new TextRun("")] }));

  const addSection = (label: string, body: string) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: label, bold: true })] }));
    for (const p of String(body).split(/\n+/).filter(Boolean)) {
      children.push(new Paragraph({ children: [new TextRun({ text: p, size: 22 })] }));
    }
  };

  for (const s of SECTIONS) {
    const body = content[s.key];
    if (!body) continue;
    addSection(s.label, String(body));
  }

  for (const s of LIST_SECTIONS) {
    const list = content[s.key];
    if (!Array.isArray(list) || list.length === 0) continue;
    addSection(s.label, list.map((r: string, i: number) => `[${i + 1}] ${r}`).join("\n"));
  }

  if (content.confidence?.score != null) {
    addSection(
      "Overall Confidence",
      `${content.confidence.level ?? ""} — ${content.confidence.score}%\n${content.confidence.rationale ?? ""}`,
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(topicTitle)}-report.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
