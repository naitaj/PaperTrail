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
  hasAnswer?: boolean;
  lockRetriever?: "embedding" | "lexical";
}

const CANONICAL_QUERIES = [
  {
    category: "Architecture",
    text: "How does multi-head attention prevent catastrophic token dilution compared to single-vector self-attention?",
  },
  {
    category: "Lexical IR",
    text: "What are the observed failure modes of BM25 on paraphrased technical definitions in out-of-vocabulary contexts?",
  },
  {
    category: "Dense Retrieval",
    text: "Compare dense vector cosine similarity against hybrid retrieval on out-of-domain academic papers.",
  },
  {
    category: "Context Decay",
    text: "What is the token context window tested in Liu et al. (Lost in the Middle) and where is recall minimum?",
  },
];

export function QuestionForm({
  onSubmit,
  isLoading,
  selectedScopeTitle,
  onClearScope,
  hasAnswer = false,
  lockRetriever,
}: QuestionFormProps) {
  const [query, setQuery] = useState("");
  const [retriever, setRetriever] = useState<"lexical" | "embedding">(
    lockRetriever || "embedding"
  );
  const [chunkConfig, setChunkConfig] = useState<string>("ck256");
  const [topK, setTopK] = useState<number>(5);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      {/* Scope Pill Banner (Shown when scoped to a specific document) */}
      {selectedScopeTitle && (
        <div className="bg-[#0b1324] border border-[#1558c9]/50 px-3.5 py-1.5 flex items-center justify-between text-[12px] shadow-[0_0_12px_rgba(21,88,201,0.2)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#d4ff24]"></span>
            <span className="font-mono text-[#94a3b8]">Scoped Document:</span>
            <span className="font-serif font-semibold text-[#f8fafc] truncate max-w-md">
              {selectedScopeTitle}
            </span>
          </div>
          <button
            onClick={onClearScope}
            className="font-mono text-[11px] text-[#60a5fa] hover:text-[#d4ff24] hover:underline font-semibold"
          >
            [Search All Papers]
          </button>
        </div>
      )}

      {/* Hero Title (Compact when answer is displayed) */}
      {!hasAnswer && (
        <div className="pt-2 pb-2">
          <div className="flex items-center gap-2 text-[#60a5fa] mb-1.5">
            <span className="font-mono text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#1558c9]"></span>
              Scholarly Query Desk
            </span>
          </div>
          <h1
            className="text-[32px] sm:text-[40px] font-bold text-[#f8fafc] leading-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Ask your <span className="text-[#d4ff24]">research.</span>
          </h1>
          <p className="font-serif text-[15px] text-[#94a3b8] mt-1.5 leading-relaxed max-w-2xl">
            Synthesizes answers strictly from retrieved passage spans with verbatim
            citations and automated verification guardrails.
          </p>
        </div>
      )}

      {/* Query Console Card */}
      <div className="bg-[#090b10] border border-[#1c2233] focus-within:border-[#1558c9] shadow-[0_4px_20px_rgba(0,0,0,0.4)] p-4 sm:p-5 transition-colors">
        <div className="flex items-center justify-between pb-2 border-b border-[#141824] text-[#94a3b8]">
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold text-[#94a3b8]">
            {hasAnswer ? "Ask Another Question" : "Research Question Specification"}
          </span>
          <span className="font-mono text-[11px] text-[#64748b]">
            {query.length} / 500
          </span>
        </div>

        <textarea
          id="research-query-box"
          maxLength={500}
          rows={hasAnswer ? 2 : 3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Ask a technical question across the corpus (e.g. attention mechanisms, BM25 saturation, LoRA rank)..."
          className="w-full bg-transparent border-0 pt-3 text-[16px] sm:text-[17px] text-[#f8fafc] placeholder:text-[#475569] focus:ring-0 focus:outline-none resize-none leading-relaxed font-serif"
        />

        {/* Action & Strategy Bar */}
        <div className="pt-3 border-t border-[#141824] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Retriever Toggle Pill */}
            {lockRetriever ? (
              <div className="inline-flex items-center gap-1.5 border border-[#1558c9]/40 bg-[#0c101c] px-3 py-1 font-mono text-[11px] text-[#f8fafc] shadow-[0_0_8px_rgba(21,88,201,0.2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff24]"></span>
                <span className="uppercase tracking-wider font-semibold">
                  {lockRetriever === "embedding" ? "Dense MiniLM (384-d)" : "BM25 Lexical"}
                </span>
              </div>
            ) : (
              <div className="inline-flex border border-[#1c2233] p-0.5 bg-[#030407]">
                <button
                  type="button"
                  onClick={() => handleRetrieverChange("embedding")}
                  className={`px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                    retriever === "embedding"
                      ? "bg-[#1558c9] text-white font-semibold shadow-[0_0_10px_rgba(21,88,201,0.6)]"
                      : "text-[#94a3b8] hover:text-[#f8fafc]"
                  }`}
                >
                  Dense MiniLM
                </button>
                <button
                  type="button"
                  onClick={() => handleRetrieverChange("lexical")}
                  className={`px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                    retriever === "lexical"
                      ? "bg-[#1558c9] text-white font-semibold shadow-[0_0_10px_rgba(21,88,201,0.6)]"
                      : "text-[#94a3b8] hover:text-[#f8fafc]"
                  }`}
                >
                  BM25 Lexical
                </button>
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-2 py-1 font-mono text-[11px] text-[#94a3b8] hover:text-[#d4ff24] border border-transparent hover:border-[#1c2233] transition-colors"
            >
              {showAdvanced ? "▾ Settings" : "▸ Settings"}
            </button>
          </div>

          {/* Submit Button - Acid Lime with Midnight Black text */}
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || isLoading}
            className="bg-[#d4ff24] hover:bg-[#e2ff5e] active:scale-[0.98] disabled:opacity-40 text-[#030407] px-6 py-2 transition-all flex items-center gap-2 cursor-pointer font-sans text-[13px] font-bold tracking-wide shadow-[0_0_20px_rgba(212,255,36,0.3)]"
          >
            <span>{isLoading ? "Synthesizing..." : "Ask Question"}</span>
            <span className="material-symbols-outlined text-[17px] font-bold">
              arrow_forward
            </span>
          </button>
        </div>

        {/* Collapsible Advanced Settings (Chunking & Top-K) */}
        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-[#141824] grid grid-cols-2 gap-4 bg-[#030407] p-3 border border-[#1c2233] text-[12px] font-mono text-[#94a3b8]">
            <div>
              <span className="block text-[10px] text-[#64748b] uppercase mb-1">
                Context Chunk Configuration
              </span>
              <select
                value={chunkConfig}
                onChange={(e) => setChunkConfig(e.target.value)}
                className="w-full bg-[#090b10] border border-[#1c2233] px-2.5 py-1 text-[#f8fafc] text-[11px] focus:outline-none focus:border-[#1558c9]"
              >
                <option value="ck256">ck256 (256 tok · 32 overlap)</option>
                <option value="ck640">ck640 (640 tok · 64 overlap)</option>
              </select>
            </div>
            <div>
              <span className="block text-[10px] text-[#64748b] uppercase mb-1">
                Passages to Retrieve (Top-K: {topK})
              </span>
              <input
                type="range"
                min="1"
                max="10"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full accent-[#d4ff24] cursor-pointer mt-1.5"
              />
            </div>
          </div>
        )}
      </div>

      {/* Suggested Canonical Queries */}
      {!hasAnswer && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-[#94a3b8] text-[11px] font-mono uppercase tracking-wider">
            <span>Curated Benchmarking Queries:</span>
            <span className="text-[#64748b]">Click to populate</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CANONICAL_QUERIES.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuery(item.text)}
                className="text-left p-3.5 bg-[#090b10] hover:bg-[#10131c] border border-[#1c2233] hover:border-[#1558c9] transition-all group cursor-pointer shadow-xs"
              >
                <span className="font-mono text-[10px] uppercase font-bold text-[#d4ff24] block mb-1 tracking-wider">
                  {item.category}
                </span>
                <p className="font-serif text-[13px] text-[#cbd5e1] group-hover:text-[#f8fafc] leading-snug line-clamp-2 transition-colors">
                  &ldquo;{item.text}&rdquo;
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
