"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="w-full bg-[#fcfbf9] border-b border-[#e7e2d7] sticky top-0 z-40">
      <div className="w-full max-w-[1720px] mx-auto px-5 h-14 flex items-center justify-between">
        {/* Brand & Masthead */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="material-symbols-outlined text-[#001d5f] text-[22px]">
              menu_book
            </span>
            <span
              className="text-[#001d5f] uppercase tracking-widest text-[16px] font-bold"
              style={{ fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}
            >
              PaperTrail
            </span>
          </Link>
          <span className="h-4 w-px bg-[#e7e2d7] hidden sm:block"></span>
          <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] text-[#78716c] uppercase tracking-wider">
            <span>Evaluated Research Assistant</span>
            <span className="bg-[#fe6f3b]/10 text-[#ab3600] border border-[#fe6f3b]/30 px-1.5 py-0.2 rounded-xs font-bold text-[9px] tracking-widest">
              RAG
            </span>
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className={`px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider transition-colors ${
              pathname === "/"
                ? "bg-[#001d5f] text-white font-semibold"
                : "text-[#57534e] hover:text-[#1c1917] hover:bg-[#f5efe6]"
            }`}
          >
            Workspace
          </Link>
          <Link
            href="/results"
            className={`px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider transition-colors ${
              pathname === "/results"
                ? "bg-[#001d5f] text-white font-semibold"
                : "text-[#57534e] hover:text-[#1c1917] hover:bg-[#f5efe6]"
            }`}
          >
            Benchmark Results
          </Link>
          <Link
            href="/about"
            className={`px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider transition-colors ${
              pathname === "/about"
                ? "bg-[#001d5f] text-white font-semibold"
                : "text-[#57534e] hover:text-[#1c1917] hover:bg-[#f5efe6]"
            }`}
          >
            Methodology
          </Link>
        </nav>

        {/* Right Status Pill */}
        <div className="hidden lg:flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#001d5f] bg-[#001d5f]/5 border border-[#001d5f]/20 px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#001d5f] animate-pulse"></span>
            <span>Corpus: 12 Papers Indexed</span>
          </span>
        </div>
      </div>
    </header>
  );
}
