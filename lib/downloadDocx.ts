import type { ReportDoc } from "@/lib/types";

/** Shared by ReportCard and ReportPreviewPanel so both "Download" buttons behave identically. */
export async function downloadDocx(report: ReportDoc): Promise<void> {
  const res = await fetch("/api/report/docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const filename = `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "report"}.docx`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
