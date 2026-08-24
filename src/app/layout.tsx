import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
// Mapbox's stylesheet must land first: it styles the map container at the
// same specificity we do, so importing it after would let it win.
import "mapbox-gl/dist/mapbox-gl.css";
import "./app.css";

// Instrument voice: the clock, the verdict, the readings.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Everything else.
const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Solmate — find your spot in the sun",
  description:
    "Find the spot that's sunny when you want it. Check any terrace, bench, balcony or playground against the sun, at any time of day.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F7FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1420" },
  ],
  width: "device-width",
  initialScale: 1,
  // The map owns pinch-zoom; page zoom on top of it fights the gesture.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Extensions commonly rewrite body attributes before React hydrates.
          A mismatch here throws away the tree and remounts the map, which
          fires a duplicate style request that Mapbox rate-limits. */}
      <body
        className={`${spaceGrotesk.variable} ${inter.variable}`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
