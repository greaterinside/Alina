import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";

/**
 * Renders Alina's answers as real formatting instead of raw "**bold**"
 * asterisks and "- " bullets — Claude writes Markdown, the chat bubble
 * used to just print it as plain text.
 */
export function MarkdownAnswer({ content, className }: { content: string; className?: string }) {
  return (
    <div className={clsx("markdown-answer", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-plum hover:text-plum/80">
              {children}
            </a>
          ),
          code: ({ children, ...props }) => (
            <code {...props} className="rounded-md bg-navy/[0.06] px-1.5 py-0.5 text-[0.9em] font-mono text-navy">
              {children}
            </code>
          ),
          pre: ({ children, ...props }) => (
            <pre {...props} className="overflow-x-auto rounded-xl bg-navy/[0.06] p-3 text-[0.9em] font-mono text-navy">
              {children}
            </pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
