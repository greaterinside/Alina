"use client";

import { useState } from "react";
import { FileText, Eye, Download } from "lucide-react";
import { downloadDocx } from "@/lib/downloadDocx";
import type { ReportDoc } from "@/lib/types";

export function ReportCard({ report, onPreview }: { report: ReportDoc; onPreview: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await downloadDocx(report);
    } catch {
      setError("Download failed — try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-1 w-full max-w-sm rounded-2xl border border-navy/10 bg-offwhite p-4">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-navy/8 text-navy">
          <FileText size={15} />
        </span>
        <p className="min-w-0 truncate text-[13.5px] font-semibold text-navy">{report.title}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onPreview}
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-navy/70 transition-colors hover:border-navy/25 hover:text-navy"
        >
          <Eye size={13} /> Preview
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-navy/70 transition-colors hover:border-navy/25 hover:text-navy disabled:opacity-50"
        >
          <Download size={13} /> {downloading ? "Preparing…" : "Download .docx"}
        </button>
      </div>
      {error && <p className="mt-2 text-[11.5px] text-terracotta">{error}</p>}
    </div>
  );
}
