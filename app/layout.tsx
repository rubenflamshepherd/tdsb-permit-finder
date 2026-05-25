import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "maplibre-gl/dist/maplibre-gl.css";
import { DeadlineBanner } from "./components/deadline-banner";
import { SiteFooter } from "./components/site-footer";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TDSB Space Finder",
  description: "Find TDSB permit spaces by availability.",
};

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DeadlineBanner />
        <Providers>
          {children}
          <SiteFooter />
        </Providers>
        {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
      </body>
    </html>
  );
}
