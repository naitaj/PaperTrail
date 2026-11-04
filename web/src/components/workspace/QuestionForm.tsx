"use client";

import { useState, KeyboardEvent } from "react";

interface QuestionFormProps {
  onSubmit: (
    query: string,
    retriever: "lexical" | "embedding",
    chunkConfig: string,
    topK?: number
  ) => void;
  isLoading: boolean;
  selectedScopeTitle: string | null;
  onClearScope: () => void;
}

const CANONICAL_QUERIES = [
  {
    category: "Architecture & Attention",
    text: "How does multi-head attention prevent catastrophic token dilution compared to single-vector self-attention?",
  },
  {
    category: "Lexical IR Failure Modes",
    text: "What are the observed failure modes of BM25 on paraphrased technical definitions in out-of-vocabulary contexts?",
  },
  {
    category: "Vector vs Hybrid Evaluation",
    text: "Compare dense vector cosine similarity against hybrid retrieval on out-of-domain academic papers.",
  },
  {
    category: "Long-Context Decay",
    text: "What is the token context window tested in Liu et al. (Lost in the Middle) and where is recall minimum?",
  },
];

export function QuestionForm({
  onSubmit,
  isLoading,
  selectedScopeTitle,
  onClearScope,
}: QuestionFormProps) {
  const [query, setQuery] = useState("");
  const [retriever, setRetriever] = useState<"lexical" | "embedding">("embedding");
  const [chunkConfig, setChunkConfig] = useState<string>("ck256");
  const [topK, setTopK] = useState<number>(5);

  const handleRetrieverChange = (newRetriever: "lexical" | "embedding") => {
    setRetriever(newRetriever);
    setChunkConfig(newRetriever === "lexical" ? "ck640" : "ck256");
  };

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed, retriever, chunkConfig, topK);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      {/* Scope Banner */}
      <div className="border border-[#747683] bg-[#ffe4c5] px-4 py-2 flex flex-wrap items-center justify-between gap-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 bg-[#fe6f3b] border border-[#ab3600]"></span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#271904] font-bold">
            {selectedScopeTitle ? (
              <>
                Scope: Document Focus ({selectedScopeTitle}){" "}
                <button
                  onClick={onClearScope}
                  className="ml-2 underline text-[#001d5f] hover:text-[#ab3600]"
                >
                  [Reset to Corpus]
                </button>
              </>
            ) : (
              "Scope: Corpus Index (12 Papers Indexed · 2,015 Chunks)"
            )}
          </span>
        </div>
        <span className="font-mono text-[11px] text-white bg-[#fe6f3b] px-2 py-0.5 font-bold tracking-wider">
          Deterministic Pass-Through Active
        </span>
      </div>

      {/* Section Lead / Broadsheet Hero Title */}
      <div className="border-b border-[#747683] pb-4">
        <div className="flex items-center gap-1.5 text-[#001d5f] mb-1">
          <span className="material-symbols-outlined text-[18px]">psychology</span>
          <span
            className="font-mono text-[11px] uppercase tracking-widest font-bold text-[#001d5f]"
            style={{
              fontFamily: "Cinzel, serif",
              letterSpacing: "0.14em",
              fontWeight: 700,
            }}
          >
            Scholarly Query Desk
          </span>
        </div>
        <h1
          className="text-[34px] md:text-[40px] text-[#271904] tracking-tight mt-1 font-bold leading-tight"
          style={{
            fontFamily: "'Playfair Display', 'Source Serif 4', serif",
            letterSpacing: "-0.03em",
          }}
        >
          Ask your research.
        </h1>
        <p className="font-serif text-[17px] text-[#444652] mt-2 max-w-2xl leading-relaxed">
          Formulate queries grounded in peer-reviewed literature. Answers are
          synthesized strictly from retrieved passages with verbatim citations
          and traceable chunk spans.
        </p>
      </div>

      {/* Query Input Console */}
      <div className="border border-[#747683] bg-white p-4">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#747683] text-[#444652]">
          <label
            htmlFor="research-query-box"
            className="font-mono text-[11px] uppercase tracking-wider font-semibold"
          >
            Query Specification Box
          </label>
          <span className="font-mono text-[11px] text-[#747683]">
            {query.length} / 500
          </span>
        </div>

        <textarea
          id="research-query-box"
          maxLength={500}
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Type your hypothesis or academic question (e.g. Compare dense vector cosine similarity against hybrid retrieval on out-of-domain technical definitions)..."
          className="w-full bg-transparent border-0 pt-2 font-serif text-[18px] text-[#271904] placeholder:text-[#747683] focus:ring-0 focus:outline-none resize-none leading-relaxed"
        />

        {/* Controls Sub-Bar */}
        <div className="pt-3 border-t border-[#747683] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-[#271904]">
            {/* Retrieval Mode */}
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] text-[#747683] uppercase">
                Index Retrieval
              </span>
              <select
                value={retriever}
                onChange={(e) =>
                  handleRetrieverChange(e.target.value as "lexical" | "embedding")
                }
                className="bg-[#ffebd5] border border-[#747683] font-mono text-[11px] px-2 py-1 text-[#271904] focus:outline-none focus:border-[#001d5f]"
              >
                <option value="embedding">Dense (all-MiniLM-L6-v2)</option>
                <option value="lexical">BM25 (Lexical Inverted)</option>
              </select>
            </div>

            {/* Chunk Size */}
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] text-[#747683] uppercase">
                Context Chunking
              </span>
              <select
                value={chunkConfig}
                onChange={(e) => setChunkConfig(e.target.value)}
                className="bg-[#ffebd5] border border-[#747683] font-mono text-[11px] px-2 py-1 text-[#271904] focus:outline-none focus:border-[#001d5f]"
              >
                <option value="ck256">256 Tok · 32 Overlap</option>
                <option value="ck640">640 Tok · 64 Overlap</option>
              </select>
            </div>

            {/* Top-K Setting */}
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] text-[#747683] uppercase">
                Passages (Top-k)
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="accent-[#001d5f] h-2 w-20 cursor-pointer"
                />
                <span className="font-mono text-[11px] font-bold text-[#001d5f] w-4 text-right">
                  {topK}
                </span>
              </div>
            </div>
          </div>

          {/* Submit Primary Button */}
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || isLoading}
            className="self-end md:self-auto bg-[#001d5f] hover:bg-[#24241f] disabled:opacity-50 text-white px-5 py-2 transition-colors border border-[#001d5f] flex items-center gap-2 cursor-pointer shadow-none font-bold text-[15px]"
            style={{
              fontFamily: "Cinzel, serif",
              letterSpacing: "0.05em",
            }}
          >
            <span>{isLoading ? "Synthesizing..." : "Ask Question"}</span>
            <span className="material-symbols-outlined text-[18px]">
              arrow_forward
            </span>
          </button>
        </div>
      </div>

      {/* Curated Research Queries (Prompt Leads) */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between border-b border-[#747683] pb-1">
          <h4 className="font-mono text-[11px] uppercase tracking-widest text-[#444652] font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-[#fe6f3b] inline-block"></span> Curated
            Canonical Queries (Click to Populate)
          </h4>
          <span className="font-mono text-[10px] bg-[#ffdbcf] text-[#390c00] px-2 py-0.5 border border-[#fe6f3b] font-semibold">
            Verified Evaluation Set
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CANONICAL_QUERIES.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setQuery(item.text)}
              className="text-left p-3 bg-[#ffebd5] hover:bg-[#ffe4c5] border border-[#747683] transition-colors group cursor-pointer"
            >
              <span className="font-mono text-[11px] text-[#ab3600] font-bold block mb-1">
                {item.category}
              </span>
              <p className="font-serif text-[14px] text-[#271904] group-hover:text-[#001d5f] transition-colors leading-snug">
                &quot;{item.text}&quot;
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Centre Col Bottom Margin Status Indicator */}
      <div className="pt-2 border-t border-[#747683] flex items-center justify-between text-[#444652] font-mono text-[11px]">
        <span>
          Evaluator:{" "}
          <strong className="text-[#271904]">
            PaperTrail Grounded Truth Engine v3.8
          </strong>
        </span>
        <span className="flex items-center gap-1.5 text-[#001d5f] font-semibold">
          <span className="w-1.5 h-1.5 bg-[#001d5f] rounded-full animate-pulse"></span>
          {isLoading ? "Executing Grounded Synthesis..." : "Ready for Query Execution"}
        </span>
      </div>
    </div>
  );
}
