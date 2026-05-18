import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TDSB Space Finder",
  description: "Find TDSB permit spaces by availability.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
