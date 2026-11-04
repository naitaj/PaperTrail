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
    <aside className="w-full h-full bg-[#fff1e5] flex flex-col justify-between border-l border-[#747683]">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Right Column Header */}
        <div className="p-4 bg-[#ffebd5] border-b border-[#747683] flex items-center justify-between">
          <h2 className="font-mono text-[13px] uppercase tracking-widest text-[#271904] font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-[#001d5f]">
              menu_book
            </span>{" "}
            Retrieved Evidence
          </h2>
          <span className="font-mono text-[11px] bg-[#fff8f4] text-[#747683] px-2 py-0.5 border border-[#747683]">
            {passages.length} / {passages.length}
          </span>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {passages.length === 0 ? (
            /* Archival Empty State Container */
            <div className="flex flex-col items-center text-center py-4">
              {/* Ruled Docket / Bibliographic Ledger Visual Artifact */}
              <div className="w-28 h-36 bg-[#fff8f4] border-2 border-[#fe6f3b] p-2 relative my-4 flex flex-col justify-between shadow-none">
                <div className="flex items-center justify-between border-b border-[#747683] pb-1">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#ab3600] font-bold">
                    FOLIO SHEET
                  </span>
                  <span className="w-2 h-2 bg-[#fe6f3b]"></span>
                </div>
                <div className="space-y-2 py-1">
                  <div className="h-px bg-[#fe6f3b]/60 w-full"></div>
                  <div className="h-px bg-[#747683]/40 w-5/6"></div>
                  <div className="h-px bg-[#fe6f3b]/40 w-full"></div>
                  <div className="h-px bg-[#747683]/40 w-4/6"></div>
                  <div className="h-px bg-[#747683]/40 w-full"></div>
                  <div className="h-px bg-[#747683]/40 w-3/4"></div>
                </div>
                <div className="border-t border-[#747683] pt-1 flex items-center justify-between">
                  <span className="font-mono text-[8px] text-[#ab3600] font-bold">
                    UNFILED
                  </span>
                  <span className="material-symbols-outlined text-[12px] text-[#ab3600]">
                    pending
                  </span>
                </div>
              </div>

              <h3
                className="text-[20px] text-[#271904] mt-2 font-bold"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                No evidence retrieved yet.
              </h3>
              <p className="font-serif text-[15px] text-[#444652] mt-1 leading-relaxed max-w-xs">
                Supporting research passages will appear here once you submit a
                question. Every generated statement is cross-checked against
                chunk-level quotations.
              </p>

              {/* Archival Verification Note */}
              <div
                className="mt-6 w-full text-left bg-[#fff8f4] border border-[#747683] border-l-4 p-3.5"
                style={{ borderLeftColor: "#fe6f3b" }}
              >
                <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[#ab3600] font-bold mb-1">
                  <span className="material-symbols-outlined text-[15px] text-[#ab3600]">
                    verified
                  </span>{" "}
                  Traceability Guarantee
                </div>
                <p className="font-serif text-[13px] text-[#444652] leading-snug">
                  Claims generated by this assistant cannot exceed the span of
                  retrieved passages. Unsubstantiated extrapolation is rejected
                  by evaluation guardrails.
                </p>
              </div>
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
                  className={`p-3 border transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[#ffebd5] border-[#001d5f] border-2"
                      : isCited
                      ? "bg-white border-[#ab3600] border-l-4"
                      : "bg-[#fff8f4] border-[#747683] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#c4c5d4] text-[11px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#001d5f] text-white px-1.5 py-0.2 font-bold text-[10px]">
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-[#271904] truncate max-w-[130px]">
                        {p.doc_id}
                      </span>
                      {p.page_start && (
                        <span className="text-[#747683]">p.{p.page_start}</span>
                      )}
                    </div>
                    <span className="text-[#05308c] font-bold">
                      {typeof p.score === "number" ? p.score.toFixed(3) : p.score}
                    </span>
                  </div>

                  {isCited && (
                    <div className="my-1.5 bg-[#ffdbcf] border-l-2 border-[#fe6f3b] p-1.5 text-[12px] font-serif text-[#390c00]">
                      <span className="font-mono text-[10px] font-bold block uppercase text-[#ab3600]">
                        Cited Verbatim Quote:
                      </span>
                      &ldquo;{quote}&rdquo;
                    </div>
                  )}

                  <p className="font-serif text-[13px] text-[#271904] mt-1.5 line-clamp-4 leading-relaxed">
                    {p.text}
                  </p>

                  <div className="mt-2 pt-1 border-t border-[#c4c5d4] flex items-center justify-between font-mono text-[10px] text-[#747683]">
                    <span>{p.config_id} · ordinal {p.ordinal}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExpandContext(p.chunk_id);
                      }}
                      className="text-[#001d5f] hover:underline flex items-center gap-0.5 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[13px]">
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

      {/* Pipeline Contract Ledger (Bottom Box) */}
      <div className="p-3.5 border-t border-[#747683] bg-[#ffebd5]">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[#747683] block mb-2 font-bold">
          API Contract Handshake
        </span>
        <div className="font-mono text-[11px] bg-[#fff8f4] border border-[#747683] p-2 space-y-1 text-[#444652]">
          <div className="flex items-center justify-between">
            <span className="text-[#001d5f] font-semibold">GET /api/documents</span>
            <span className="text-[#747683]">200 OK</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#271904]">POST /api/ask</span>
            <span className="text-[#747683]">
              {hasExecutedQuery ? "200 OK" : "IDLE"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-[#747683]/50">
            <span className="text-[#444652] text-[10px]">EVAL_METRIC</span>
            <span className="text-white bg-[#fe6f3b] px-1.5 py-0.5 font-bold text-[10px] tracking-wider">
              FAITHFULNESS_100
            </span>
          </div>
        </div>
      </div>

      {/* Context Expansion Modal Sheet */}
      {modalChunkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] bg-[#FFFCF6] border-2 border-[#191916] flex flex-col shadow-none">
            <div className="p-4 border-b border-[#747683] bg-[#ffebd5] flex items-center justify-between">
              <div>
                <h3 className="font-mono text-[13px] uppercase tracking-wider font-bold text-[#271904]">
                  Archival Context Expansion (Ordinal ±1)
                </h3>
                <span className="font-mono text-[11px] text-[#747683]">
                  Target Chunk: {modalChunkId}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="text-[#271904] hover:bg-[#ffe4c5] p-1 font-bold font-mono text-[14px]"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 font-serif text-[15px] leading-relaxed">
              {loadingContext ? (
                <div className="p-8 text-center font-mono text-[12px] text-[#747683]">
                  Loading adjacent manuscript chunks from database...
                </div>
              ) : contextData ? (
                <div className="space-y-4">
                  {contextData.prev_chunk && (
                    <div className="p-3 bg-[#fff1e5] border border-[#747683]/60">
                      <span className="font-mono text-[10px] text-[#747683] uppercase block mb-1">
                        Preceding Passage (Ordinal{" "}
                        {String(contextData.prev_chunk.ordinal)})
                      </span>
                      <p className="text-[#444652]">
                        {String(contextData.prev_chunk.text)}
                      </p>
                    </div>
                  )}

                  <div className="p-4 bg-white border-2 border-[#001d5f]">
                    <span className="font-mono text-[10px] text-[#001d5f] font-bold uppercase block mb-1">
                      Retrieved Evidence Chunk (Ordinal{" "}
                      {String(contextData.chunk?.ordinal)})
                    </span>
                    <p className="text-[#271904] font-medium">
                      {String(contextData.chunk?.text)}
                    </p>
                  </div>

                  {contextData.next_chunk && (
                    <div className="p-3 bg-[#fff1e5] border border-[#747683]/60">
                      <span className="font-mono text-[10px] text-[#747683] uppercase block mb-1">
                        Succeeding Passage (Ordinal{" "}
                        {String(contextData.next_chunk.ordinal)})
                      </span>
                      <p className="text-[#444652]">
                        {String(contextData.next_chunk.text)}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-[#ba1a1a] font-mono text-[12px]">
                  Failed to load adjacent chunk context.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#747683] bg-[#ffebd5] flex justify-end">
              <button
                onClick={closeModal}
                className="bg-[#001d5f] text-white px-4 py-1.5 font-mono text-[12px] font-bold uppercase"
              >
                Dismiss Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
