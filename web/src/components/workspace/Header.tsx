"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="w-full bg-[#030407]/95 backdrop-blur-md border-b border-[#1c2233] sticky top-0 z-40">
      <div className="w-full max-w-[1720px] mx-auto px-5 h-14 flex items-center justify-between">
        {/* Brand & Masthead */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="material-symbols-outlined text-[#d4ff24] text-[22px] transition-transform group-hover:scale-105">
              menu_book
            </span>
            <span
              className="text-[#f8fafc] group-hover:text-[#d4ff24] transition-colors uppercase tracking-widest text-[16px] font-bold"
              style={{ fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}
            >
              PaperTrail
            </span>
          </Link>
          <span className="h-4 w-px bg-[#1c2233] hidden sm:block"></span>
          <span className="hidden sm:inline-flex items-center gap-2 font-mono text-[11px] text-[#94a3b8] uppercase tracking-wider">
            <span>Evaluated Research Assistant</span>
            <span className="bg-[#1558c9] text-white px-1.5 py-0.2 rounded-xs font-bold text-[9px] tracking-widest">
              RAG
            </span>
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5">
          <Link
            href="/"
            className={`px-3 py-1 font-mono text-[12px] uppercase tracking-wider transition-all ${
              pathname === "/"
                ? "bg-[#1558c9] text-white font-semibold shadow-[0_0_12px_rgba(21,88,201,0.5)]"
                : "text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#121520]"
            }`}
          >
            Workspace
          </Link>
          <Link
            href="/results"
            className={`px-3 py-1 font-mono text-[12px] uppercase tracking-wider transition-all ${
              pathname === "/results"
                ? "bg-[#1558c9] text-white font-semibold shadow-[0_0_12px_rgba(21,88,201,0.5)]"
                : "text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#121520]"
            }`}
          >
            Benchmark Results
          </Link>
          <Link
            href="/about"
            className={`px-3 py-1 font-mono text-[12px] uppercase tracking-wider transition-all ${
              pathname === "/about"
                ? "bg-[#1558c9] text-white font-semibold shadow-[0_0_12px_rgba(21,88,201,0.5)]"
                : "text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#121520]"
            }`}
          >
            Methodology
          </Link>
        </nav>

        {/* Right Status Pill */}
        <div className="hidden lg:flex items-center gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] text-[#f8fafc] bg-[#0c101c] border border-[#1558c9]/50 px-2.5 py-1 shadow-[0_0_8px_rgba(21,88,201,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff24] animate-pulse"></span>
            <span>Corpus: 12 Papers Active</span>
          </span>
        </div>
      </div>
    </header>
  );
}
