"use client";

import { useState } from "react";
import { ScoredChunk } from "@/lib/retrieval/types";
import { GroundedClaim } from "./AnswerPanel";

interface EvidencePanelProps {
  passages: ScoredChunk[];
  claims: GroundedClaim[];
  selectedCitationChunkId: string | null;
  onSelectChunk: (chunkId: string | null) => void;
  hasExecutedQuery?: boolean;
}

interface NeighbourContextData {
  chunk: Record<string, unknown>;
  prev_chunk: Record<string, unknown> | null;
  next_chunk: Record<string, unknown> | null;
}

export function EvidencePanel({
  passages,
  claims,
  selectedCitationChunkId,
  onSelectChunk,
  hasExecutedQuery = false,
}: EvidencePanelProps) {
  const [modalChunkId, setModalChunkId] = useState<string | null>(null);
  const [contextData, setContextData] = useState<NeighbourContextData | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Map of cited chunks and their quotes
  const citedQuoteMap = new Map<string, string>();
  for (const c of claims) {
    if (c.citation_chunk_id && c.evidence_quote) {
      citedQuoteMap.set(c.citation_chunk_id, c.evidence_quote);
    }
  }

  const handleExpandContext = async (chunkId: string) => {
    setModalChunkId(chunkId);
    setLoadingContext(true);
    try {
      const res = await fetch(`/api/chunks/${encodeURIComponent(chunkId)}`);
      if (res.ok) {
        const data = await res.json();
        setContextData(data);
      }
    } catch (err) {
      console.error("Failed to load context expansion:", err);
    } finally {
      setLoadingContext(false);
    }
  };

  const closeModal = () => {
    setModalChunkId(null);
    setContextData(null);
  };

  return (
    <div className="w-full h-full flex flex-col justify-between bg-[#030407]">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Right Column Header */}
        <div className="p-3.5 border-b border-[#1c2233] bg-[#090b10] flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8] font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#1558c9]">
              menu_book
            </span>
            Retrieved Evidence
          </span>
          <span className="font-mono text-[10px] bg-[#1558c9]/20 text-[#d4ff24] border border-[#1558c9]/40 px-2 py-0.5 rounded-none font-semibold">
            {passages.length} Passages
          </span>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {passages.length === 0 ? (
            /* Calm Empty State */
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#090b10] border border-[#1c2233] flex items-center justify-center text-[#1558c9]">
                <span className="material-symbols-outlined text-[20px]">
                  find_in_page
                </span>
              </div>
              <h3 className="text-[15px] font-bold text-[#f8fafc] font-sans">
                No passages retrieved
              </h3>
              <p className="font-sans text-[13px] text-[#64748b] leading-relaxed max-w-[240px]">
                Ask a question to see retrieved passages with relevance scores and verified quote spans.
              </p>
            </div>
          ) : (
            passages.map((p, idx) => {
              const isCited = citedQuoteMap.has(p.chunk_id);
              const quote = citedQuoteMap.get(p.chunk_id);
              const isSelected = selectedCitationChunkId === p.chunk_id;

              return (
                <div
                  key={p.chunk_id}
                  id={`chunk-${p.chunk_id}`}
                  onClick={() => onSelectChunk(isSelected ? null : p.chunk_id)}
                  className={`p-3 border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#1558c9]/15 border-[#d4ff24] shadow-[0_0_12px_rgba(212,255,36,0.15)]"
                      : isCited
                      ? "bg-[#0c0e16] border-l-2 border-l-[#d4ff24] border-t-[#1c2233] border-r-[#1c2233] border-b-[#1c2233]"
                      : "bg-[#090b10] border-[#1c2233] hover:border-[#1558c9]/50 hover:bg-[#0d1017]"
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#1c2233] text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-[#1558c9] text-white px-1.5 py-0.2 font-bold text-[9px]">
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-[#f8fafc] truncate max-w-[120px]">
                        {p.doc_id}
                      </span>
                      {p.page_start && (
                        <span className="text-[#64748b]">p.{p.page_start}</span>
                      )}
                    </div>
                    <span className="text-[#d4ff24] font-bold">
                      {typeof p.score === "number" ? p.score.toFixed(3) : p.score}
                    </span>
                  </div>

                  {isCited && quote && (
                    <div className="my-2 bg-[#1558c9]/15 border-l-2 border-[#d4ff24] p-2 text-[11px] font-sans text-[#e2e8f0]">
                      <span className="font-mono text-[9px] font-bold block uppercase text-[#d4ff24] mb-0.5">
                        Cited Verbatim Quote:
                      </span>
                      &ldquo;{quote}&rdquo;
                    </div>
                  )}

                  <p className="font-sans text-[12px] text-[#94a3b8] mt-1.5 line-clamp-3 leading-relaxed">
                    {p.text}
                  </p>

                  <div className="mt-2 pt-1.5 border-t border-[#1c2233] flex items-center justify-between font-mono text-[10px] text-[#64748b]">
                    <span>{p.config_id} · ord {p.ordinal}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExpandContext(p.chunk_id);
                      }}
                      className="text-[#1558c9] hover:text-[#d4ff24] hover:underline flex items-center gap-0.5 font-semibold transition-colors"
                    >
                      <span className="material-symbols-outlined text-[12px]">
                        open_in_full
                      </span>
                      Context ±1
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Contract & Handshake Footer */}
      <div className="p-3 border-t border-[#1c2233] bg-[#090b10] text-[10px] font-mono text-[#94a3b8] space-y-1">
        <div className="flex items-center justify-between">
          <span>GET /api/documents</span>
          <span className="text-[#d4ff24] font-semibold">200 OK</span>
        </div>
        <div className="flex items-center justify-between">
          <span>POST /api/ask</span>
          <span className={hasExecutedQuery ? "text-[#d4ff24] font-semibold" : "text-[#64748b]"}>
            {hasExecutedQuery ? "200 OK" : "IDLE"}
          </span>
        </div>
      </div>

      {/* Context Expansion Modal Sheet */}
      {modalChunkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl max-h-[85vh] bg-[#090b10] border border-[#1c2233] shadow-2xl flex flex-col">
            <div className="p-4 border-b border-[#1c2233] bg-[#0c0e14] flex items-center justify-between">
              <div>
                <h3 className="font-mono text-[12px] uppercase tracking-wider font-bold text-[#f8fafc]">
                  Surrounding Context (Ordinal ±1)
                </h3>
                <span className="font-mono text-[10px] text-[#64748b]">
                  Target: {modalChunkId}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="text-[#94a3b8] hover:text-[#d4ff24] font-mono text-[13px] font-bold px-2 py-1 transition-colors"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 font-sans text-[13px] leading-relaxed">
              {loadingContext ? (
                <div className="p-8 text-center font-mono text-[11px] text-[#94a3b8]">
                  Loading adjacent chunks from database...
                </div>
              ) : contextData ? (
                <div className="space-y-3">
                  {contextData.prev_chunk && (
                    <div className="p-3 bg-[#030407] border border-[#1c2233] text-[#94a3b8]">
                      <span className="font-mono text-[9px] text-[#64748b] uppercase block mb-1">
                        Preceding Chunk (Ordinal {String(contextData.prev_chunk.ordinal)})
                      </span>
                      <p>{String(contextData.prev_chunk.text)}</p>
                    </div>
                  )}

                  <div className="p-3.5 bg-[#1558c9]/15 border-2 border-[#d4ff24] text-[#f8fafc]">
                    <span className="font-mono text-[9px] text-[#d4ff24] font-bold uppercase block mb-1">
                      Retrieved Passage (Ordinal {String(contextData.chunk?.ordinal)})
                    </span>
                    <p className="font-medium">{String(contextData.chunk?.text)}</p>
                  </div>

                  {contextData.next_chunk && (
                    <div className="p-3 bg-[#030407] border border-[#1c2233] text-[#94a3b8]">
                      <span className="font-mono text-[9px] text-[#64748b] uppercase block mb-1">
                        Succeeding Chunk (Ordinal {String(contextData.next_chunk.ordinal)})
                      </span>
                      <p>{String(contextData.next_chunk.text)}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-red-400 font-mono text-[11px]">
                  Failed to load adjacent context.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#1c2233] bg-[#0c0e14] flex justify-end">
              <button
                onClick={closeModal}
                className="bg-[#d4ff24] text-[#030407] px-4 py-1.5 font-mono text-[11px] font-bold uppercase hover:bg-[#bceb16] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
