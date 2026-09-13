import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Telugu } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ToastProvider } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { DevAnnotations } from "@/components/dev/DevAnnotations";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Telugu script, for posters.
 *
 * Geist is loaded with the latin subset and has no Telugu coverage, so Telugu
 * text on a canvas would otherwise fall through to whatever the device
 * happens to have - a different typeface on Windows, Android and iOS, and
 * empty boxes on a stripped Android WebView. A poster is an image other
 * people see, so "it looks different on every phone" is a real defect rather
 * than a cosmetic one.
 *
 * `preload: false` because nobody should pay for this file until a Telugu
 * glyph is actually drawn. Canvas never triggers a font load on its own, so
 * the fetch happens exactly when ensurePosterFonts() asks for it by name.
 */
const notoTelugu = Noto_Sans_Telugu({
  variable: "--font-telugu",
  subsets: ["telugu", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "OneInfo AI Video Creator",
  description: "Turn an idea into a finished video with your AI creative team.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoTelugu.variable} h-full antialiased`}
    >
      {/*
        Browser extensions (Grammarly, password managers, and friends) attach
        their own attributes to <body> before React hydrates, which reads as a
        server/client mismatch even though this className is a static literal.
        React only suppresses this element's own attributes and text, one level
        deep, so real mismatches inside the app still surface normally.
      */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AuthProvider>
          <TooltipProvider>
            <ToastProvider>
              {children}
              {/*
                Dev-only visual feedback toolbar. This guard stops it
                rendering in production; the component itself is what keeps
                the package out of the production bundle — see the note in
                DevAnnotations on why guarding here is not sufficient.
              */}
              {process.env.NODE_ENV === "development" && <DevAnnotations />}
            </ToastProvider>
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
