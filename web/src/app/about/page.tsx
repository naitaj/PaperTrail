import Link from "next/link";
import { Header } from "@/components/workspace/Header";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#fff8f4] text-[#271904] font-serif flex flex-col">
      <Header />

      {/* Top Banner */}
      <div
        className="w-full bg-[#ffe4c5] px-6 py-2 flex items-center justify-between border-b border-[#747683] border-l-4"
        style={{ borderLeftColor: "#fe6f3b" }}
      >
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span
            className="uppercase text-[#001d5f] font-bold"
            style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.14em" }}
          >
            Folio PTR-2025-ARCH
          </span>
          <span className="text-[#747683]">/</span>
          <span className="text-[#444652]">
            Methodology &amp; Verification Architecture
          </span>
        </div>
        <span className="font-mono text-[11px] bg-[#001d5f] text-white px-2 py-0.5 font-bold uppercase">
          Open-Access Specification
        </span>
      </div>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8 space-y-6">
        <div className="border-b border-[#747683] pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[#001d5f] hover:underline font-bold mb-2"
          >
            ← Return to Workspace
          </Link>
          <h1
            className="text-[32px] md:text-[38px] font-bold text-[#271904] tracking-tight leading-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            System Architecture &amp; Methodology
          </h1>
          <p className="font-serif text-[17px] text-[#444652] mt-1">
            An evaluated research-paper assistant with grounded citations,
            abstention benchmarking, and lexical vs. dense retrieval comparison.
          </p>
        </div>

        {/* Principles */}
        <div className="border border-[#747683] bg-white p-6 space-y-4 shadow-none">
          <h2
            className="text-[20px] font-bold text-[#271904] flex items-center gap-2 border-b border-[#747683] pb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            <span className="material-symbols-outlined text-[#001d5f]">
              verified_user
            </span>
            Core Architectural Principles
          </h2>
          <ul className="space-y-3 font-serif text-[15px] leading-relaxed text-[#271904]">
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[#001d5f] text-[18px] shrink-0 mt-0.5">
                check_circle
              </span>
              <span>
                <strong>Strict Evidence Grounding:</strong> Every factual claim returned by the assistant is tied to a specific chunk and verified against a verbatim quote from the original paper.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[#001d5f] text-[18px] shrink-0 mt-0.5">
                check_circle
              </span>
              <span>
                <strong>Automated Status Downgrading:</strong> If citations cannot be verified or passages do not contain the quoted text, the response is automatically downgraded to <em>partial</em> or <em>abstain</em>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[#001d5f] text-[18px] shrink-0 mt-0.5">
                check_circle
              </span>
              <span>
                <strong>Pre-LLM Abstention Gating:</strong> A confidence gate evaluates top retrieval scores. If evidence is clearly missing or off-topic, PaperTrail fast-abstains in ~1ms without burning LLM tokens.
              </span>
            </li>
          </ul>
        </div>

        {/* Database & Security */}
        <div className="border border-[#747683] bg-white p-6 space-y-3 shadow-none">
          <h2
            className="text-[20px] font-bold text-[#271904] flex items-center gap-2 border-b border-[#747683] pb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            <span className="material-symbols-outlined text-[#001d5f]">
              database
            </span>
            Database &amp; Row-Level Security (RLS)
          </h2>
          <p className="font-serif text-[15px] leading-relaxed text-[#444652]">
            PaperTrail runs on <strong>Supabase PostgreSQL</strong> with the <strong>pgvector</strong> extension. All 12 tables in the public schema enforce <strong>Row-Level Security (RLS)</strong>, blocking unauthorized PostgREST API tampering while serving low-latency pooled queries to Next.js and Python.
          </p>
        </div>

        {/* Zero-Cost Inference */}
        <div className="border border-[#747683] bg-white p-6 space-y-3 shadow-none">
          <h2
            className="text-[20px] font-bold text-[#271904] flex items-center gap-2 border-b border-[#747683] pb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            <span className="material-symbols-outlined text-[#001d5f]">
              bolt
            </span>
            Zero-Cost AI Inference Stack
          </h2>
          <p className="font-serif text-[15px] leading-relaxed text-[#444652]">
            Embeddings are generated with <strong>all-MiniLM-L6-v2 (384-d)</strong> via local Python <code>fastembed</code> during ingestion and directly in the user browser using <code>@xenova/transformers</code>. Text synthesis is powered strictly by <strong>Groq Cloud</strong> (<code>openai/gpt-oss-120b</code>) for zero-cost operation.
          </p>
        </div>
      </main>

      <footer className="w-full bg-[#fff1e5] border-t border-[#747683] py-4 mt-8">
        <div className="w-full max-w-4xl mx-auto px-6 flex items-center justify-between font-mono text-[11px] text-[#747683]">
          <span>PaperTrail Bibliographic Press</span>
          <span>Archival Invariant v3.8</span>
        </div>
      </footer>
    </div>
  );
}
