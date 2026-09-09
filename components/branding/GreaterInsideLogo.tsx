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
        className="absolute right-0 top-1/2 aspect-square rounded-full bg-terracotta"
        style={{ height: "78%", transform: "translate(28%, -50%)" }}
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
