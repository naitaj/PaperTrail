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
    <div className="w-full h-full flex flex-col justify-between bg-[#f7f4ee]">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Right Column Header */}
        <div className="p-3.5 border-b border-[#e7e2d7] bg-[#fcfbf9] flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#57534e] font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#001d5f]">
              menu_book
            </span>
            Retrieved Evidence
          </span>
          <span className="font-mono text-[10px] bg-[#001d5f]/10 text-[#001d5f] px-2 py-0.5 rounded-xs font-semibold">
            {passages.length} Passages
          </span>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {passages.length === 0 ? (
            /* Calm Archival Empty State */
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#ede8df] flex items-center justify-center text-[#78716c]">
                <span className="material-symbols-outlined text-[20px]">
                  find_in_page
                </span>
              </div>
              <h3
                className="text-[16px] font-bold text-[#1c1917]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                No passages retrieved
              </h3>
              <p className="font-serif text-[13px] text-[#78716c] leading-relaxed max-w-[240px]">
                Ask a question to see retrieved passages from the corpus with relevance scores and verified quote spans.
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
                      ? "bg-white border-[#001d5f] shadow-xs"
                      : isCited
                      ? "bg-white border-l-3 border-l-[#fe6f3b] border-t-[#e7e2d7] border-r-[#e7e2d7] border-b-[#e7e2d7]"
                      : "bg-[#fcfbf9] border-[#e7e2d7] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between pb-1 border-b border-[#f0ebe1] text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-[#001d5f] text-white px-1.5 py-0.2 font-bold text-[9px]">
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-[#1c1917] truncate max-w-[120px]">
                        {p.doc_id}
                      </span>
                      {p.page_start && (
                        <span className="text-[#a8a29e]">p.{p.page_start}</span>
                      )}
                    </div>
                    <span className="text-[#001d5f] font-bold">
                      {typeof p.score === "number" ? p.score.toFixed(3) : p.score}
                    </span>
                  </div>

                  {isCited && quote && (
                    <div className="my-1.5 bg-[#fff7ed] border-l-2 border-[#f97316] p-1.5 text-[11px] font-serif text-[#9a3412]">
                      <span className="font-mono text-[9px] font-bold block uppercase text-[#c2410c] mb-0.5">
                        Cited Verbatim Quote:
                      </span>
                      &ldquo;{quote}&rdquo;
                    </div>
                  )}

                  <p className="font-serif text-[12px] text-[#44403c] mt-1.5 line-clamp-3 leading-relaxed">
                    {p.text}
                  </p>

                  <div className="mt-2 pt-1 border-t border-[#f0ebe1] flex items-center justify-between font-mono text-[10px] text-[#a8a29e]">
                    <span>{p.config_id} · ord {p.ordinal}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExpandContext(p.chunk_id);
                      }}
                      className="text-[#001d5f] hover:underline flex items-center gap-0.5 font-semibold"
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
      <div className="p-3 border-t border-[#e7e2d7] bg-[#fcfbf9] text-[10px] font-mono text-[#78716c] space-y-1">
        <div className="flex items-center justify-between">
          <span>GET /api/documents</span>
          <span className="text-emerald-700 font-semibold">200 OK</span>
        </div>
        <div className="flex items-center justify-between">
          <span>POST /api/ask</span>
          <span>{hasExecutedQuery ? "200 OK" : "IDLE"}</span>
        </div>
      </div>

      {/* Context Expansion Modal Sheet */}
      {modalChunkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] bg-[#fcfbf9] border border-[#d4cdbc] shadow-xl flex flex-col">
            <div className="p-4 border-b border-[#e7e2d7] bg-white flex items-center justify-between">
              <div>
                <h3 className="font-mono text-[12px] uppercase tracking-wider font-bold text-[#1c1917]">
                  Surrounding Context (Ordinal ±1)
                </h3>
                <span className="font-mono text-[10px] text-[#78716c]">
                  Target: {modalChunkId}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="text-[#78716c] hover:text-[#1c1917] font-mono text-[13px] font-bold px-2 py-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 font-serif text-[14px] leading-relaxed">
              {loadingContext ? (
                <div className="p-8 text-center font-mono text-[11px] text-[#78716c]">
                  Loading adjacent chunks from database...
                </div>
              ) : contextData ? (
                <div className="space-y-3">
                  {contextData.prev_chunk && (
                    <div className="p-3 bg-white border border-[#e7e2d7] text-[#57534e]">
                      <span className="font-mono text-[9px] text-[#a8a29e] uppercase block mb-1">
                        Preceding Chunk (Ordinal {String(contextData.prev_chunk.ordinal)})
                      </span>
                      <p>{String(contextData.prev_chunk.text)}</p>
                    </div>
                  )}

                  <div className="p-3.5 bg-white border-2 border-[#001d5f] text-[#1c1917]">
                    <span className="font-mono text-[9px] text-[#001d5f] font-bold uppercase block mb-1">
                      Retrieved Passage (Ordinal {String(contextData.chunk?.ordinal)})
                    </span>
                    <p className="font-medium">{String(contextData.chunk?.text)}</p>
                  </div>

                  {contextData.next_chunk && (
                    <div className="p-3 bg-white border border-[#e7e2d7] text-[#57534e]">
                      <span className="font-mono text-[9px] text-[#a8a29e] uppercase block mb-1">
                        Succeeding Chunk (Ordinal {String(contextData.next_chunk.ordinal)})
                      </span>
                      <p>{String(contextData.next_chunk.text)}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-red-600 font-mono text-[11px]">
                  Failed to load adjacent context.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#e7e2d7] bg-white flex justify-end">
              <button
                onClick={closeModal}
                className="bg-[#001d5f] text-white px-4 py-1.5 font-mono text-[11px] font-bold uppercase"
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
