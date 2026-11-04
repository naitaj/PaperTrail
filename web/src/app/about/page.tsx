import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/workspace/Header";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#030407] text-[#f8fafc] font-sans flex flex-col">
      <Header />

      {/* Top Banner */}
      <div className="w-full bg-[#090b10] px-6 py-2.5 flex items-center justify-between border-b border-[#1c2233] border-l-4 border-l-[#d4ff24]">
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="uppercase text-[#d4ff24] font-bold tracking-widest">
            Folio PTR-2025-ARCH
          </span>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#94a3b8]">
            Methodology &amp; Verification Architecture
          </span>
        </div>
        <span className="font-mono text-[11px] bg-[#1558c9]/20 text-[#d4ff24] border border-[#1558c9]/40 px-2 py-0.5 font-bold uppercase">
          Open-Access Specification
        </span>
      </div>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8 space-y-6">
        <div className="border-b border-[#1c2233] pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[#d4ff24] hover:underline font-bold mb-2 transition-colors"
          >
            ← Return to Workspace
          </Link>
          <h1 className="text-[30px] md:text-[36px] font-bold text-[#f8fafc] tracking-tight leading-tight">
            System Architecture &amp; Methodology
          </h1>
          <p className="font-sans text-[15px] text-[#94a3b8] mt-1">
            An evaluated research-paper assistant with grounded citations,
            abstention benchmarking, and lexical vs. dense retrieval comparison.
          </p>
        </div>

        {/* Principles */}
        <div className="border border-[#1c2233] bg-[#090b10] p-6 space-y-4 shadow-xl">
          <h2 className="text-[19px] font-bold text-[#f8fafc] flex items-center gap-2 border-b border-[#1c2233] pb-2">
            <span className="material-symbols-outlined text-[#1558c9]">
              verified_user
            </span>
            Core Architectural Principles
          </h2>
          <ul className="space-y-3 font-sans text-[14px] leading-relaxed text-[#cbd5e1]">
            <li className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[#d4ff24] text-[18px] shrink-0 mt-0.5">
                check_circle
              </span>
              <span>
                <strong className="text-[#f8fafc]">Strict Evidence Grounding:</strong> Every factual claim returned by the assistant is tied to a specific chunk and verified against a verbatim quote from the original paper.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[#d4ff24] text-[18px] shrink-0 mt-0.5">
                check_circle
              </span>
              <span>
                <strong className="text-[#f8fafc]">Automated Status Downgrading:</strong> If citations cannot be verified or passages do not contain the quoted text, the response is automatically downgraded to <em className="text-amber-400">partial</em> or <em className="text-red-400">abstain</em>.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[#d4ff24] text-[18px] shrink-0 mt-0.5">
                check_circle
              </span>
              <span>
                <strong className="text-[#f8fafc]">Pre-LLM Abstention Gating:</strong> A confidence gate evaluates top retrieval scores. If evidence is clearly missing or off-topic, PaperTrail fast-abstains in ~1ms without burning LLM tokens.
              </span>
            </li>
          </ul>
        </div>

        {/* Database & Security */}
        <div className="border border-[#1c2233] bg-[#090b10] p-6 space-y-3 shadow-xl">
          <h2 className="text-[19px] font-bold text-[#f8fafc] flex items-center gap-2 border-b border-[#1c2233] pb-2">
            <span className="material-symbols-outlined text-[#1558c9]">
              database
            </span>
            Database &amp; Row-Level Security (RLS)
          </h2>
          <p className="font-sans text-[14px] leading-relaxed text-[#94a3b8]">
            PaperTrail runs on <strong className="text-[#f8fafc]">Supabase PostgreSQL</strong> with the <strong className="text-[#f8fafc]">pgvector</strong> extension. All 12 tables in the public schema enforce <strong className="text-[#d4ff24]">Row-Level Security (RLS)</strong>, blocking unauthorized PostgREST API tampering while serving low-latency pooled queries to Next.js and Python.
          </p>
        </div>

        {/* Zero-Cost Inference */}
        <div className="border border-[#1c2233] bg-[#090b10] p-6 space-y-3 shadow-xl">
          <h2 className="text-[19px] font-bold text-[#f8fafc] flex items-center gap-2 border-b border-[#1c2233] pb-2">
            <span className="material-symbols-outlined text-[#1558c9]">
              bolt
            </span>
            Zero-Cost AI Inference Stack
          </h2>
          <p className="font-sans text-[14px] leading-relaxed text-[#94a3b8]">
            Embeddings are generated with <strong className="text-[#f8fafc]">all-MiniLM-L6-v2 (384-d)</strong> via local Python <code className="text-[#d4ff24] bg-[#030407] px-1 py-0.5 border border-[#1c2233]">fastembed</code> during ingestion and directly in the user browser using <code className="text-[#d4ff24] bg-[#030407] px-1 py-0.5 border border-[#1c2233]">@xenova/transformers</code>. Text synthesis is powered strictly by <strong className="text-[#f8fafc]">Groq Cloud</strong> (<code className="text-[#1558c9] bg-[#030407] px-1 py-0.5 border border-[#1c2233]">openai/gpt-oss-120b</code>) for zero-cost operation.
          </p>
        </div>
      </main>

      <footer className="w-full bg-[#090b10] border-t border-[#1c2233] py-4 mt-8">
        <div className="w-full max-w-4xl mx-auto px-6 flex items-center justify-between font-mono text-[11px] text-[#64748b]">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="PaperTrail" width={16} height={16} className="w-4 h-4 object-contain" />
            <span className="text-[#94a3b8]">PaperTrail Evaluated Neural Corpus</span>
          </div>
          <span>Archival Invariant v3.8</span>
        </div>
      </footer>
    </div>
  );
}
