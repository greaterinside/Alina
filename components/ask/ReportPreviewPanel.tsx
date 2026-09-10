"use client";

import { useState } from "react";
import { X, Download } from "lucide-react";
import { MarkdownAnswer } from "@/components/ask/MarkdownAnswer";
import { downloadDocx } from "@/lib/downloadDocx";
import type { ReportDoc } from "@/lib/types";

/** The "like Claude does" side panel — full report next to the two-line chat summary. */
export function ReportPreviewPanel({
  report,
  onClose,
}: {
  report: ReportDoc | null;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (!report) return;
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

  if (!report) return null;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-navy/30" aria-hidden />
      <div className="fixed inset-y-3 right-3 z-50 flex w-[calc(100%-1.5rem)] max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-pop">
        <div className="flex flex-none items-center justify-between border-b border-navy/8 px-6 py-4">
          <p className="min-w-0 truncate text-[14.5px] font-semibold text-navy">{report.title}</p>
          <button
            onClick={onClose}
            className="grid h-8 w-8 flex-none place-items-center rounded-xl text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <MarkdownAnswer content={report.markdown} className="text-[14px] text-charcoal" />
        </div>
        <div className="flex-none border-t border-navy/8 px-6 py-4">
          {error && <p className="mb-2 text-[12px] text-terracotta">{error}</p>}
          <button onClick={handleDownload} disabled={downloading} className="btn-cta w-full">
            <Download size={16} />
            {downloading ? "Preparing…" : "Download as Word"}
          </button>
        </div>
      </div>
    </>
  );
}
