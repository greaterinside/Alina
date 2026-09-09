import clsx from "clsx";

/**
 * The real Greater Inside wordmark — two right-aligned stacked lowercase
 * lines with the terracotta brand circle centered on their shared right
 * edge, matching the brand identity deck. `variant="light"` is the
 * white-on-dark lockup for the navy sidebar; `variant="dark"` is the
 * black-on-off-white lockup for light backgrounds.
 *
 * Proportions below are measured directly off the brand deck (300dpi
 * render of the logo slide), not eyeballed:
 *  - circle diameter ≈ 1.575x the two-line text block's height
 *  - circle is vertically centered on that block
 *  - circle's horizontal CENTER sits on the text block's right edge
 *    (not its own edge touching the text's edge — the center point)
 *  - "inside" (the shorter word) right-aligns under "greater", not
 *    left-aligns — the two lines share a right edge, not a left one
 */
export function GreaterInsideLogo({
  variant = "light",
  size = 15,
  className,
}: {
  variant?: "light" | "dark";
  size?: number;
  className?: string;
}) {
  const circleSize = Math.round(size * 3.1);

  return (
    <div
      className={clsx("relative inline-block text-right", className)}
      style={{ fontSize: size, lineHeight: 0.92 }}
    >
      <span
        className={clsx(
          "relative z-10 block font-extrabold tracking-tight",
          variant === "light" ? "text-white" : "text-charcoal"
        )}
      >
        greater
      </span>
      <span
        className={clsx(
          "relative z-10 block font-extrabold tracking-tight",
          variant === "light" ? "text-white" : "text-charcoal"
        )}
      >
        inside
      </span>
      <span
        className="absolute left-full top-1/2 rounded-full bg-terracotta"
        style={{
          width: circleSize,
          height: circleSize,
          transform: "translate(-50%, -50%)",
        }}
        aria-hidden
      />
    </div>
  );
}

/** Just the circle brand mark, for collapsed rails, favicons, or compact spots. */
export function GreaterInsideMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={clsx("block flex-none rounded-full bg-terracotta", className)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
