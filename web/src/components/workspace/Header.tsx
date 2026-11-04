"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="w-full bg-[#fff8f4]/95 backdrop-blur-sm border-b border-[#747683]">
      <div className="w-full px-6 flex flex-col justify-between pt-2 pb-2">
        {/* Top Masthead Row */}
        <div className="flex items-center justify-between border-b border-[#c4c5d4] pb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#001d5f] text-[20px]">
              menu_book
            </span>
            <Link
              href="/"
              className="text-[#001d5f] uppercase tracking-widest text-[16px]"
              style={{
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.18em",
                fontWeight: 800,
              }}
            >
              PaperTrail
            </Link>
            <span className="h-3 w-px bg-[#747683]"></span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#444652] flex items-center gap-1.5">
              An Evaluated Research-Paper Assistant ·{" "}
              <span className="bg-[#fe6f3b] text-white px-1.5 py-0.5 rounded-full font-bold text-[10px] tracking-widest inline-block">
                RAG EDITION
              </span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:inline-block font-mono text-[11px] text-[#747683] uppercase tracking-wider">
              Vol. IV · Series 2025
            </span>
            <div className="w-8 h-8 rounded-full bg-[#001d5f] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="flex items-center justify-between pt-2">
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-4 py-1 font-mono text-[13px] uppercase tracking-wider transition-colors ${pathname === "/"
                  ? "bg-[#05308c] text-white font-bold"
                  : "text-[#444652] hover:text-[#271904] hover:bg-[#ffebd5]"
                }`}
            >
              Workspace
            </Link>
            <Link
              href="/results"
              className={`px-4 py-1 font-mono text-[13px] uppercase tracking-wider transition-colors ${pathname === "/results"
                  ? "bg-[#05308c] text-white font-bold"
                  : "text-[#444652] hover:text-[#271904] hover:bg-[#ffebd5]"
                }`}
            >
              Benchmark Results
            </Link>
            <Link
              href="/about"
              className={`px-4 py-1 font-mono text-[13px] uppercase tracking-wider transition-colors ${pathname === "/about"
                  ? "bg-[#05308c] text-white font-bold"
                  : "text-[#444652] hover:text-[#271904] hover:bg-[#ffebd5]"
                }`}
            >
              Methodology
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center font-mono text-[11px] text-[#001d5f] uppercase border border-[#001d5f] px-2 py-0.5 font-bold">
              Verification Active
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
