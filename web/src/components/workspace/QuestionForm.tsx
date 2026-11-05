"use client";

import { useState, KeyboardEvent } from "react";

interface QuestionFormProps {
  onSubmit: (
    query: string,
    retriever: "lexical" | "embedding" | "hybrid",
    chunkConfig: string,
    topK?: number
  ) => void;
  isLoading: boolean;
  hasAnswer?: boolean;
  lockRetriever?: "embedding" | "lexical" | "hybrid";
}

export function QuestionForm({
  onSubmit,
  isLoading,
  hasAnswer = false,
  lockRetriever,
}: QuestionFormProps) {
  const [query, setQuery] = useState("");
  const [retriever, setRetriever] = useState<"lexical" | "embedding" | "hybrid">(
    lockRetriever || "embedding"
  );
  const [chunkConfig, setChunkConfig] = useState<string>("ck256");
  const [topK, setTopK] = useState<number>(5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleRetrieverChange = (newRetriever: "lexical" | "embedding" | "hybrid") => {
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
      {/* Hero Title (Compact when answer is displayed) */}
      {!hasAnswer && (
        <div className="pt-2 pb-2">
          <h1
            className="text-[32px] sm:text-[40px] font-bold text-[#f8fafc] leading-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Ask your <span className="text-[#d4ff24]">research.</span>
          </h1>
          <p className="font-serif text-[15px] text-[#94a3b8] mt-1.5 leading-relaxed max-w-2xl">
            Answers grounded in retrieved documents with verified citations.
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
                  {lockRetriever === "embedding"
                    ? "Dense MiniLM (384-d)"
                    : lockRetriever === "hybrid"
                    ? "Hybrid RRF"
                    : "BM25 Lexical"}
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
                <button
                  type="button"
                  onClick={() => handleRetrieverChange("hybrid")}
                  className={`px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                    retriever === "hybrid"
                      ? "bg-[#1558c9] text-white font-semibold shadow-[0_0_10px_rgba(21,88,201,0.6)]"
                      : "text-[#94a3b8] hover:text-[#f8fafc]"
                  }`}
                >
                  Hybrid RRF
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
    </div>
  );
}
