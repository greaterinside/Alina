import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

/**
 * Converts the simple Markdown subset composeReport() asks Claude to write
 * (headings, paragraphs, bold, bullet/numbered lists — no tables, no nested
 * lists) into a real .docx. Line-based on purpose: the report prompt keeps
 * output to that flat subset, so a full Markdown AST parser would be more
 * machinery than the input ever needs.
 */
function parseInlineRuns(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  if (parts.length === 0) return [new TextRun("")];
  return parts.map((part) =>
    part.startsWith("**") && part.endsWith("**")
      ? new TextRun({ text: part.slice(2, -2), bold: true })
      : new TextRun(part)
  );
}

const NUMBERED_LIST_REF = "report-numbered-list";

export async function markdownToDocxBuffer(title: string, markdown: string): Promise<Buffer> {
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
  ];

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const bullet = line.match(/^[-*]\s+(.+)/);
    const numbered = line.match(/^\d+[.)]\s+(.+)/);

    if (h1) {
      paragraphs.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 }));
    } else if (h2) {
      paragraphs.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 }));
    } else if (h3) {
      paragraphs.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 }));
    } else if (bullet) {
      paragraphs.push(new Paragraph({ children: parseInlineRuns(bullet[1]), bullet: { level: 0 } }));
    } else if (numbered) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(numbered[1]),
          numbering: { reference: NUMBERED_LIST_REF, level: 0 },
        })
      );
    } else {
      paragraphs.push(new Paragraph({ children: parseInlineRuns(line), spacing: { after: 160 } }));
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: NUMBERED_LIST_REF,
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "start" }],
        },
      ],
    },
    sections: [{ children: paragraphs }],
  });

  return Packer.toBuffer(doc);
}
