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
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem",
        "3xl": "2.25rem",
        blob: "2rem",
      },
      boxShadow: {
        chunky: "0 4px 0 0 rgba(17, 50, 91, 0.18)",
        "chunky-sm": "0 3px 0 0 rgba(17, 50, 91, 0.16)",
        card: "0 2px 10px rgba(17, 50, 91, 0.08)",
        pop: "0 10px 30px rgba(17, 50, 91, 0.14)",
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
      },
      animation: {
        "bounce-in": "bounce-in 0.35s cubic-bezier(.2,.8,.3,1.4) both",
        "float-y": "float-y 3.2s ease-in-out infinite",
        wiggle: "wiggle 0.6s ease-in-out",
        "pulse-ring": "pulse-ring 1.4s cubic-bezier(0,0,0.2,1) infinite",
        blink: "blink 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
