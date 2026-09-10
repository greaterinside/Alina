import { NextRequest, NextResponse } from "next/server";
import { markdownToDocxBuffer } from "@/lib/docx-export";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { title, markdown } = (await req.json()) as { title?: string; markdown?: string };
  if (!title || !markdown) {
    return NextResponse.json({ error: "title and markdown are required" }, { status: 400 });
  }

  const buffer = await markdownToDocxBuffer(title, markdown);
  const filename = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "report"}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
