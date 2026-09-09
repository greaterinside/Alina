import type { Metadata } from "next";
import { Poppins, Caveat } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

// Stand-in cursive font for the handwritten welcome moment — swap for the
// brand deck's dedicated script font once that's finalized.
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alina — Greater Inside",
  description: "Alina, the Greater Inside team's knowledge companion.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${caveat.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
