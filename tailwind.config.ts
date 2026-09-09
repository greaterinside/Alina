import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#11325B",
        offwhite: "#F4F4F4",
        pink: "#DFC5D6",
        plum: "#832A63",
        charcoal: "#1F1F1F",
        terracotta: "#C8653D",
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        hand: ["var(--font-hand)", "cursive"],
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem",
        "3xl": "2.25rem",
        blob: "2rem",
      },
      boxShadow: {
        // Soft, diffuse elevation — no hard offset. Depth reads through
        // blur/spread, not a cartoon drop-shadow.
        xs: "0 1px 2px rgba(17, 50, 91, 0.05)",
        soft: "0 1px 2px rgba(17, 50, 91, 0.04), 0 6px 20px -6px rgba(17, 50, 91, 0.10)",
        card: "0 1px 2px rgba(17, 50, 91, 0.04), 0 10px 28px -10px rgba(17, 50, 91, 0.14)",
        pop: "0 24px 64px -16px rgba(17, 50, 91, 0.28)",
        cta: "0 10px 24px -8px rgba(200, 101, 61, 0.45)",
      },
      keyframes: {
        "bounce-in": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        "float-y": {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        wiggle: {
          "0%,100%": { transform: "rotate(-1.5deg)" },
          "50%": { transform: "rotate(1.5deg)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(200,101,61,0.35)" },
          "100%": { boxShadow: "0 0 0 10px rgba(200,101,61,0)" },
        },
        blink: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        "write-reveal": {
          "0%": { clipPath: "inset(0 100% 0 0)" },
          "100%": { clipPath: "inset(0 0% 0 0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "bounce-in": "bounce-in 0.35s cubic-bezier(.2,.8,.3,1.4) both",
        "float-y": "float-y 3.2s ease-in-out infinite",
        wiggle: "wiggle 0.6s ease-in-out",
        "pulse-ring": "pulse-ring 1.4s cubic-bezier(0,0,0.2,1) infinite",
        blink: "blink 1.4s ease-in-out infinite",
        "write-reveal": "write-reveal 1.1s cubic-bezier(.65,0,.35,1) both",
        "fade-up": "fade-up 0.5s ease both",
      },
    },
  },
  plugins: [],
};
export default config;
