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
}: QuestionFormProps) {
  const [query, setQuery] = useState("");
  const [retriever, setRetriever] = useState<"lexical" | "embedding">("embedding");
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
      {/* Scope Pill Banner (Only shown when scoped to a specific document) */}
      {selectedScopeTitle && (
        <div className="bg-[#fff1e5] border border-[#f3d9c2] px-3.5 py-1.5 flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#fe6f3b]"></span>
            <span className="font-mono text-[#57534e]">Scoped to paper:</span>
            <span className="font-serif font-semibold text-[#1c1917] truncate max-w-md">
              {selectedScopeTitle}
            </span>
          </div>
          <button
            onClick={onClearScope}
            className="font-mono text-[11px] text-[#001d5f] hover:underline font-semibold"
          >
            [Search All Papers]
          </button>
        </div>
      )}

      {/* Hero Title (Compact when answer is displayed) */}
      {!hasAnswer && (
        <div className="pt-1 pb-2">
          <div className="flex items-center gap-2 text-[#001d5f] mb-1">
            <span className="font-mono text-[11px] uppercase tracking-widest font-bold">
              Scholarly Query Desk
            </span>
          </div>
          <h1
            className="text-[28px] sm:text-[34px] font-bold text-[#1c1917] leading-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Ask your research.
          </h1>
          <p className="font-serif text-[15px] text-[#57534e] mt-1 leading-relaxed">
            Synthesizes answers strictly from retrieved passage spans with verbatim
            citations and automated verification guardrails.
          </p>
        </div>
      )}

      {/* Query Console Card */}
      <div className="bg-white border border-[#e7e2d7] shadow-[0_1px_3px_rgba(0,0,0,0.03)] p-4 sm:p-5">
        <div className="flex items-center justify-between pb-2 border-b border-[#f0ebe1] text-[#78716c]">
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold text-[#57534e]">
            {hasAnswer ? "Ask another question" : "Research Question"}
          </span>
          <span className="font-mono text-[11px]">
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
          placeholder="Ask a question grounded in the corpus (e.g. attention mechanisms, BM25 saturation, LoRA rank)..."
          className="w-full bg-transparent border-0 pt-3 text-[16px] sm:text-[17px] text-[#1c1917] placeholder:text-[#a8a29e] focus:ring-0 focus:outline-none resize-none leading-relaxed font-serif"
        />

        {/* Action & Strategy Bar */}
        <div className="pt-3 border-t border-[#f0ebe1] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Retriever Toggle Pill */}
            <div className="inline-flex border border-[#e7e2d7] p-0.5 bg-[#f7f4ee]">
              <button
                type="button"
                onClick={() => handleRetrieverChange("embedding")}
                className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  retriever === "embedding"
                    ? "bg-[#001d5f] text-white font-semibold"
                    : "text-[#57534e] hover:text-[#1c1917]"
                }`}
              >
                Dense MiniLM
              </button>
              <button
                type="button"
                onClick={() => handleRetrieverChange("lexical")}
                className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  retriever === "lexical"
                    ? "bg-[#001d5f] text-white font-semibold"
                    : "text-[#57534e] hover:text-[#1c1917]"
                }`}
              >
                BM25 Lexical
              </button>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-2 py-1 font-mono text-[11px] text-[#78716c] hover:text-[#1c1917] border border-transparent hover:border-[#e7e2d7] transition-colors"
            >
              {showAdvanced ? "▾ Settings" : "▸ Settings"}
            </button>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || isLoading}
            className="bg-[#001d5f] hover:bg-[#1a365d] disabled:opacity-40 text-white px-5 py-2 transition-all flex items-center gap-2 cursor-pointer font-sans text-[13px] font-semibold tracking-wide"
          >
            <span>{isLoading ? "Synthesizing..." : "Ask Question"}</span>
            <span className="material-symbols-outlined text-[16px]">
              arrow_forward
            </span>
          </button>
        </div>

        {/* Collapsible Advanced Settings (Chunking & Top-K) */}
        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-[#f0ebe1] grid grid-cols-2 gap-4 bg-[#fcfbf9] p-3 text-[12px] font-mono text-[#57534e]">
            <div>
              <span className="block text-[10px] text-[#78716c] uppercase mb-1">
                Context Chunk Configuration
              </span>
              <select
                value={chunkConfig}
                onChange={(e) => setChunkConfig(e.target.value)}
                className="w-full bg-white border border-[#e7e2d7] px-2 py-1 text-[#1c1917] text-[11px] focus:outline-none focus:border-[#001d5f]"
              >
                <option value="ck256">ck256 (256 tok · 32 overlap)</option>
                <option value="ck640">ck640 (640 tok · 64 overlap)</option>
              </select>
            </div>
            <div>
              <span className="block text-[10px] text-[#78716c] uppercase mb-1">
                Passages to Retrieve (Top-K: {topK})
              </span>
              <input
                type="range"
                min="1"
                max="10"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full accent-[#001d5f] cursor-pointer mt-1.5"
              />
            </div>
          </div>
        )}
      </div>

      {/* Suggested Canonical Queries (Only shown when no answer is displayed) */}
      {!hasAnswer && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-[#78716c] text-[11px] font-mono uppercase tracking-wider">
            <span>Curated Benchmarking Queries:</span>
            <span className="text-[#a8a29e]">Click to populate</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CANONICAL_QUERIES.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuery(item.text)}
                className="text-left p-3 bg-white hover:bg-[#fff9f2] border border-[#e7e2d7] hover:border-[#f3d9c2] transition-colors group cursor-pointer"
              >
                <span className="font-mono text-[10px] uppercase font-bold text-[#ab3600] block mb-1">
                  {item.category}
                </span>
                <p className="font-serif text-[13px] text-[#292524] group-hover:text-[#001d5f] leading-snug line-clamp-2">
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
