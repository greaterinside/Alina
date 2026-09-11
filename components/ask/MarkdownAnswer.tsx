import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";

/**
 * Renders Alina's answers as real formatting instead of raw "**bold**"
 * asterisks and "- " bullets — Claude writes Markdown, the chat bubble
 * used to just print it as plain text.
 */
export function MarkdownAnswer({
  content,
  className,
  dark,
}: {
  content: string;
  className?: string;
  /** Renders on the glass panels sitting over the particle background — swaps navy-on-white accents for light-on-dark ones. */
  dark?: boolean;
}) {
  return (
    <div className={clsx("markdown-answer", dark && "markdown-answer--dark", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                "underline underline-offset-2",
                dark ? "text-cyan-300 hover:text-cyan-200" : "text-plum hover:text-plum/80"
              )}
            >
              {children}
            </a>
          ),
          code: ({ children, ...props }) => (
            <code
              {...props}
              className={clsx(
                "rounded-md px-1.5 py-0.5 text-[0.9em] font-mono",
                dark ? "bg-white/10 text-white" : "bg-navy/[0.06] text-navy"
              )}
            >
              {children}
            </code>
          ),
          pre: ({ children, ...props }) => (
            <pre
              {...props}
              className={clsx(
                "overflow-x-auto rounded-xl p-3 text-[0.9em] font-mono",
                dark ? "bg-white/10 text-white" : "bg-navy/[0.06] text-navy"
              )}
            >
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
