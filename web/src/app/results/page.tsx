import Link from "next/link";
import { Header } from "@/components/workspace/Header";

export default function ResultsPage() {
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
            Folio PTR-2025-BENCH
          </span>
          <span className="text-[#747683]">/</span>
          <span className="text-[#444652]">
            Test Split Evaluation Ledger (SHA-256 Partition Lock)
          </span>
        </div>
        <span className="font-mono text-[11px] bg-[#001d5f] text-white px-2 py-0.5 font-bold uppercase">
          Pre-Registered Benchmark
        </span>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 space-y-8">
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
            Empirical Retrieval &amp; Generation Benchmark
          </h1>
          <p className="font-serif text-[17px] text-[#444652] mt-1">
            Standardized evaluation comparing Lexical Inverted Indexing (Okapi BM25)
            against Dense Neural Embeddings (all-MiniLM-L6-v2) on 40 stratified questions.
          </p>
        </div>

        {/* Test Split Benchmark Results */}
        <div className="border border-[#747683] bg-white p-6 shadow-none">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#747683]">
            <div>
              <h2
                className="text-[20px] font-bold text-[#271904] flex items-center gap-2"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                <span className="material-symbols-outlined text-[#001d5f]">
                  query_stats
                </span>
                Held-Out Test Split Performance Ledger (20 Questions, K=5)
              </h2>
              <p className="font-mono text-[11px] text-[#747683] mt-0.5">
                Evaluated with strict SHA-256 partition lock (c215596...).
              </p>
            </div>
            <span className="font-mono text-[11px] bg-[#ffdbcf] text-[#390c00] border border-[#fe6f3b] px-2 py-1 font-bold">
              Groq openai/gpt-oss-120b
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-serif text-[14px] border-collapse">
              <thead>
                <tr className="border-b-2 border-[#747683] bg-[#ffebd5] font-mono text-[11px] uppercase text-[#271904]">
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
              <tbody className="divide-y divide-[#c4c5d4]">
                <tr className="bg-[#fff1e5] font-bold text-[#001d5f]">
                  <td className="py-3 px-3 flex items-center gap-1.5 font-semibold">
                    <span className="material-symbols-outlined text-[16px] text-[#001d5f]">
                      verified
                    </span>
                    <span>Dense Embed (Challenger)</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[12px]">ck256</td>
                  <td className="py-3 px-3 font-mono text-[12px]">60.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">56.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">0.343</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#001d5f]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px] text-[#001d5f]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">911 ms</td>
                </tr>
                <tr className="hover:bg-[#fff8f4]">
                  <td className="py-3 px-3 font-medium text-[#271904]">
                    BM25 Lexical (Baseline)
                  </td>
                  <td className="py-3 px-3 font-mono text-[12px]">ck640</td>
                  <td className="py-3 px-3 font-mono text-[12px]">46.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">43.3%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">0.372</td>
                  <td className="py-3 px-3 font-mono text-[12px]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">1,549 ms</td>
                </tr>
                <tr className="hover:bg-[#fff8f4] text-[#747683]">
                  <td className="py-3 px-3 font-medium text-[#444652]">
                    BM25 Lexical (Reference)
                  </td>
                  <td className="py-3 px-3 font-mono text-[12px]">ck256</td>
                  <td className="py-3 px-3 font-mono text-[12px]">46.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">43.3%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">0.467</td>
                  <td className="py-3 px-3 font-mono text-[12px]">66.7%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">100.0%</td>
                  <td className="py-3 px-3 font-mono text-[12px]">1,462 ms</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-3 border-t border-[#747683] grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px] text-[#444652]">
            <div className="p-3 bg-[#fff8f4] border border-[#747683]">
              <span className="font-bold text-[#001d5f] block uppercase mb-1">
                Dense Advantage: +13.3%
              </span>
              Embedding retrieval achieved 60.0% HitRate@5 vs 46.7% for BM25, winning on semantic paraphrase queries.
            </div>
            <div className="p-3 bg-[#fff8f4] border border-[#747683]">
              <span className="font-bold text-[#ab3600] block uppercase mb-1">
                Zero Hallucination
              </span>
              Citation precision achieved 100% with chunk verification downgrade guardrails.
            </div>
            <div className="p-3 bg-[#fff8f4] border border-[#747683]">
              <span className="font-bold text-[#05308c] block uppercase mb-1">
                Fast Abstention: ~1ms
              </span>
              100% abstention accuracy on out-of-domain and ungroundable questions using pre-LLM score gating.
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full bg-[#fff1e5] border-t border-[#747683] py-4 mt-8">
        <div className="w-full max-w-6xl mx-auto px-6 flex items-center justify-between font-mono text-[11px] text-[#747683]">
          <span>PaperTrail Bibliographic Press</span>
          <span>Archival Invariant v3.8</span>
        </div>
      </footer>
    </div>
  );
}
