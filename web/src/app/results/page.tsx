import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/workspace/Header";

export default function ResultsPage() {
  return (
    <div className="min-h-screen bg-[#030407] text-[#f8fafc] font-sans flex flex-col">
      <Header />

      {/* Top Banner */}
      <div className="w-full bg-[#090b10] px-6 py-2.5 flex items-center justify-between border-b border-[#1c2233] border-l-4 border-l-[#d4ff24]">
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="uppercase text-[#d4ff24] font-bold tracking-widest">
            Folio PTR-2025-BENCH
          </span>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#94a3b8]">
            Test Split Evaluation Ledger (SHA-256 Partition Lock)
          </span>
        </div>
        <span className="font-mono text-[11px] bg-[#1558c9]/20 text-[#d4ff24] border border-[#1558c9]/40 px-2 py-0.5 font-bold uppercase">
          Pre-Registered Benchmark
        </span>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 space-y-8">
        <div className="border-b border-[#1c2233] pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[#d4ff24] hover:underline font-bold mb-2 transition-colors"
          >
            ← Return to Workspace
          </Link>
          <h1 className="text-[30px] md:text-[36px] font-bold text-[#f8fafc] tracking-tight leading-tight">
            Empirical Retrieval &amp; Generation Benchmark
          </h1>
          <p className="font-sans text-[15px] text-[#94a3b8] mt-1">
            Standardized evaluation comparing Lexical Inverted Indexing (Okapi BM25)
            against Dense Neural Embeddings (all-MiniLM-L6-v2) on 40 stratified questions.
          </p>
        </div>

        {/* Test Split Benchmark Results */}
        <div className="border border-[#1c2233] bg-[#090b10] p-6 shadow-xl">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1c2233]">
            <div>
              <h2 className="text-[19px] font-bold text-[#f8fafc] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1558c9]">
                  query_stats
                </span>
                Held-Out Test Split Performance Ledger (20 Questions, K=5)
              </h2>
              <p className="font-mono text-[11px] text-[#64748b] mt-0.5">
                Evaluated with strict SHA-256 partition lock (c215596...).
              </p>
            </div>
            <span className="font-mono text-[11px] bg-[#1558c9] text-white px-2 py-1 font-bold">
              Groq openai/gpt-oss-120b
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-[#1c2233] bg-[#0c0e14] font-mono text-[11px] uppercase text-[#94a3b8]">
                  <th className="py-2.5 px-3">Configuration</th>
                  <th className="py-2.5 px-3">Chunking</th>
                  <th className="py-2.5 px-3">HitRate@5</th>
                  <th className="py-2.5 px-3">Recall@5</th>
                  <th className="py-2.5 px-3">MRR</th>
                  <th className="py-2.5 px-3">Citation Prec</th>
                  <th className="py-2.5 px-3">Abstain Acc</th>
                  <th className="py-2.5 px-3">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2233]">
                <tr className="bg-[#1558c9]/10 font-bold text-[#f8fafc]">
                  <td className="py-3 px-3 flex items-center gap-1.5 font-semibold text-[#d4ff24]">
                    <span className="material-symbols-outlined text-[16px] text-[#d4ff24]">
                      verified
                    </span>
                    <span>Dense Embed (Challenger)</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#94a3b8]">ck256</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#d4ff24]">60.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#d4ff24]">56.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">0.343</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#d4ff24]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#d4ff24]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#94a3b8]">911 ms</td>
                </tr>
                <tr className="hover:bg-[#0c0e14] text-[#cbd5e1]">
                  <td className="py-3 px-3 font-medium">
                    BM25 Lexical (Baseline)
                  </td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#64748b]">ck640</td>
                  <td className="py-3 px-3 font-mono text-[12px]">46.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">43.3%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">0.372</td>
                  <td className="py-3 px-3 font-mono text-[12px]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#64748b]">1,549 ms</td>
                </tr>
                <tr className="hover:bg-[#0c0e14] text-[#94a3b8]">
                  <td className="py-3 px-3 font-medium">
                    BM25 Lexical (Reference)
                  </td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#64748b]">ck256</td>
                  <td className="py-3 px-3 font-mono text-[12px]">46.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">43.3%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">0.467</td>
                  <td className="py-3 px-3 font-mono text-[12px]">66.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#64748b]">1,462 ms</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1c2233] grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px] text-[#94a3b8]">
            <div className="p-3 bg-[#030407] border border-[#1c2233]">
              <span className="font-bold text-[#d4ff24] block uppercase mb-1">
                Dense Advantage: +13.3%
              </span>
              Embedding retrieval achieved 60.0% HitRate@5 vs 46.7% for BM25, winning on semantic paraphrase queries.
            </div>
            <div className="p-3 bg-[#030407] border border-[#1c2233]">
              <span className="font-bold text-[#1558c9] block uppercase mb-1">
                Zero Hallucination
              </span>
              Citation precision achieved 100% with chunk verification downgrade guardrails.
            </div>
            <div className="p-3 bg-[#030407] border border-[#1c2233]">
              <span className="font-bold text-[#d4ff24] block uppercase mb-1">
                Fast Abstention: ~1ms
              </span>
              100% abstention accuracy on out-of-domain and ungroundable questions using pre-LLM score gating.
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full bg-[#090b10] border-t border-[#1c2233] py-4 mt-8">
        <div className="w-full max-w-6xl mx-auto px-6 flex items-center justify-between font-mono text-[11px] text-[#64748b]">
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
