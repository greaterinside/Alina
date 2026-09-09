import clsx from "clsx";

/**
 * The real Greater Inside wordmark — two stacked lowercase lines with the
 * terracotta brand circle overlapping behind the right side, matching the
 * brand identity deck. `variant="light"` is the white-on-dark lockup for
 * the navy sidebar; `variant="dark"` is the black-on-off-white lockup for
 * light backgrounds.
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
  // Sized directly off `size` in px rather than a % of the wrapper's own
  // height — that wrapper's height is intrinsic (two lines of text), and
  // a percentage height on an absolutely-positioned child of an
  // auto-height container doesn't resolve per the CSS spec, so the circle
  // was collapsing to almost nothing.
  const circleSize = Math.round(size * 1.55);

  return (
    <div
      className={clsx("relative inline-block", className)}
      style={{ fontSize: size, lineHeight: 0.98 }}
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
        className="absolute right-0 top-1/2 rounded-full bg-terracotta"
        style={{
          width: circleSize,
          height: circleSize,
          transform: "translate(30%, -50%)",
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
