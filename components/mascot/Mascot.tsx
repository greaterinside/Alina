import clsx from "clsx";

export type MascotState = "idle" | "thinking" | "speaking" | "happy";

const SIZES = { sm: 40, md: 64, lg: 112, xl: 172 } as const;

/**
 * Which /public/mascot/{state}.png files actually exist right now. Kept
 * as a static manifest (instead of probing for the file at runtime) so
 * there's no async gap where a placeholder flashes before the real art
 * loads — the correct source is known synchronously, even during SSR.
 *
 * Update this after adding a new file to public/mascot/.
 */
const AVAILABLE: Record<MascotState, boolean> = {
  idle: true,
  thinking: true,
  speaking: true,
  happy: true,
};

function resolveState(state: MascotState): MascotState | null {
  if (AVAILABLE[state]) return state;
  if (AVAILABLE.idle) return "idle";
  return null;
}

// Light motion on top of the real per-state photos — a small extra sense
// of life, not a substitute for the expression itself. Thinking gets no
// image motion (the pose already reads as "concentrating"; wobbling it
// would undercut that) but keeps its dot badge below.
const STATE_MOTION: Record<MascotState, string> = {
  idle: "animate-float-y",
  thinking: "",
  speaking: "animate-mascot-talk",
  happy: "animate-bounce-in",
};

/**
 * Alina's mascot. Renders the real illustrated PNG for the requested
 * state when one exists; otherwise the real idle illustration (the
 * actual character, just not mid-expression) rather than an invented
 * placeholder. Only draws the inline SVG face below if no real artwork
 * exists at all yet.
 */
export function Mascot({
  state = "idle",
  size = "lg",
  className,
}: {
  state?: MascotState;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  const resolvedState = resolveState(state);

  return (
    <div
      className={clsx("relative flex-none", className)}
      style={{ width: px, height: px }}
      aria-hidden
    >
      <div className={clsx("h-full w-full", STATE_MOTION[state])}>
        {resolvedState ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/mascot/${resolvedState}.png`}
            alt=""
            width={px}
            height={px}
            className="h-full w-full select-none object-contain"
            draggable={false}
          />
        ) : (
          <MascotFallback state={state} px={px} />
        )}
      </div>

      {state === "thinking" && <ThinkDots />}
      {state === "happy" && <SparkleBadge />}
    </div>
  );
}

function ThinkDots() {
  return (
    <div className="absolute -right-1 -top-1 flex items-end gap-[3px] rounded-full bg-white px-1.5 py-1 shadow-soft">
      <span className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-navy/50 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-navy/50 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-navy/50" />
    </div>
  );
}

function SparkleBadge() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="absolute -right-1.5 -top-1.5 h-5 w-5 animate-sparkle-pop text-plum drop-shadow-sm"
      fill="currentColor"
    >
      <path d="M12 1l2.2 5.6L20 9l-5.8 1.4L12 16l-2.2-5.6L4 9l5.8-1.4z" />
    </svg>
  );
}

function MascotFallback({ state, px }: { state: MascotState; px: number }) {
  const eyeY = state === "happy" ? 46 : 48;

  return (
    <svg viewBox="0 0 100 100" width={px} height={px} className="drop-shadow-sm">
      <defs>
        <radialGradient id="body-grad" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#D9784F" />
          <stop offset="100%" stopColor="#C8653D" />
        </radialGradient>
      </defs>

      {/* sparkle mark, echoes the logo */}
      <path
        d="M84 12 L87 19 L94 22 L87 25 L84 32 L81 25 L74 22 L81 19 Z"
        fill="#832A63"
        opacity={state === "happy" ? 1 : 0.55}
      />

      {/* body */}
      <circle cx="50" cy="54" r="38" fill="url(#body-grad)" />
      <circle cx="50" cy="54" r="38" fill="none" stroke="#11325B" strokeOpacity="0.08" strokeWidth="2" />

      {/* face plate */}
      <ellipse cx="50" cy="58" rx="26" ry="22" fill="#F4F4F4" />

      {/* eyes */}
      {state === "thinking" ? (
        <>
          <circle cx="41" cy={eyeY} r="3.2" fill="#11325B" />
          <circle cx="59" cy={eyeY} r="3.2" fill="#11325B" opacity="0.4" />
        </>
      ) : (
        <>
          <circle cx="41" cy={eyeY} r="3.4" fill="#11325B" className="origin-center animate-blink" />
          <circle cx="59" cy={eyeY} r="3.4" fill="#11325B" className="origin-center animate-blink" />
        </>
      )}

      {/* mouth */}
      {state === "speaking" ? (
        <ellipse cx="50" cy="68" rx="7" ry="5.5" fill="#11325B" opacity="0.85" />
      ) : state === "happy" ? (
        <path
          d="M39 66 Q50 78 61 66"
          fill="none"
          stroke="#11325B"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      ) : state === "thinking" ? (
        <path d="M42 68 Q50 65 58 69" fill="none" stroke="#11325B" strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M42 67 Q50 72 58 67" fill="none" stroke="#11325B" strokeWidth="3" strokeLinecap="round" />
      )}

      {/* cheeks on happy */}
      {state === "happy" && (
        <>
          <circle cx="33" cy="60" r="4" fill="#DFC5D6" opacity="0.7" />
          <circle cx="67" cy="60" r="4" fill="#DFC5D6" opacity="0.7" />
        </>
      )}
    </svg>
  );
}
