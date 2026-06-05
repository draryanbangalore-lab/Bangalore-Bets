import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NavBar from "@/components/NavBar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Capper Tracker",
  description: "Aggregate capper picks, track performance, find consensus bets.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col relative">

        {/* Ambient purple glow */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full"
            style={{ background: "radial-gradient(ellipse at center, rgba(108,59,255,0.11) 0%, transparent 70%)" }}
          />
        </div>

        {/* Grain */}
        <div className="grain" aria-hidden="true" />

        {/* Navigation */}
        <NavBar />

        {/* Page — pad top for fixed navbar */}
        <div className="relative z-10 flex flex-col flex-1 pt-14">
          {children}
        </div>

      </body>
    </html>
  );
}
