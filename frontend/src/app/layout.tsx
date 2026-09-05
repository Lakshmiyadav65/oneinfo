import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ToastProvider } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OneInfo AI Video Creator",
  description: "Turn an idea into a finished video with your AI creative team.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
