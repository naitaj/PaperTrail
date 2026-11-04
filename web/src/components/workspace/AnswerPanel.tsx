"use client";

import { ScoredChunk } from "@/lib/retrieval/types";

export interface GroundedClaim {
  claim_text: string;
  citation_chunk_id: string;
  doc_id: string;
  page: number;
  evidence_quote: string;
}

export interface AnswerResponse {
  decision: "answerable" | "partial" | "abstain";
  answer: string;
  claims: GroundedClaim[];
  abstention_reason?: string | null;
  retrieved: ScoredChunk[];
  model?: string;
  gate_triggered?: boolean;
  timings_ms?: {
    retrieve: number;
    generate: number;
    total: number;
  };
}

interface AnswerPanelProps {
  response: AnswerResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedCitationChunkId: string | null;
  onSelectCitation: (chunkId: string) => void;
}

export function AnswerPanel({
  response,
  isLoading,
  error,
  selectedCitationChunkId,
  onSelectCitation,
}: AnswerPanelProps) {
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e7e2d7] p-8 text-center my-4 space-y-3">
        <div className="inline-block w-7 h-7 border-2 border-[#001d5f] border-t-transparent rounded-full animate-spin"></div>
        <h3
          className="text-[17px] font-bold text-[#1c1917]"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Synthesizing Grounded Answer
        </h3>
        <p className="font-serif text-[13px] text-[#78716c] max-w-sm mx-auto leading-relaxed">
          Retrieving passage vectors, checking confidence bounds, and validating verbatim citation quotes...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50/70 p-4 text-red-900 my-4 font-serif">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-red-700 mt-0.5">
            error
          </span>
          <div>
            <h3 className="font-mono text-[11px] uppercase font-bold tracking-wider text-red-800">
              Query Error
            </h3>
            <p className="mt-1 text-[13px] text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!response) {
    return null;
  }

  const {
    decision,
    answer,
    claims,
    abstention_reason,
    timings_ms,
    model,
    gate_triggered,
  } = response;

  const isAbstain = decision === "abstain";
  const isPartial = decision === "partial";

  // Build unique references list from claims
  const referenceMap = new Map<
    string,
    { docId: string; page: number; count: number; chunkId: string; quote: string }
  >();
  for (const claim of claims) {
    if (claim.citation_chunk_id) {
      if (!referenceMap.has(claim.citation_chunk_id)) {
        referenceMap.set(claim.citation_chunk_id, {
          docId: claim.doc_id,
          page: claim.page,
          count: 1,
          chunkId: claim.citation_chunk_id,
          quote: claim.evidence_quote,
        });
      } else {
        const existing = referenceMap.get(claim.citation_chunk_id)!;
        existing.count += 1;
      }
    }
  }

  const references = Array.from(referenceMap.values());

  return (
    <article className="bg-white border border-[#e7e2d7] shadow-[0_1px_4px_rgba(0,0,0,0.03)] p-6 my-2">
      {/* Top Ledger Header */}
      <div className="flex flex-wrap items-center justify-between pb-3.5 border-b border-[#f0ebe1] gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 tracking-wider text-white ${
              isAbstain
                ? "bg-[#ab3600]"
                : isPartial
                ? "bg-[#d97706]"
                : "bg-[#001d5f]"
            }`}
          >
            {decision.toUpperCase()}
          </span>
          <span className="font-mono text-[11px] text-[#78716c]">
            Model: <span className="text-[#1c1917] font-medium">{model || "gpt-oss-120b"}</span>
          </span>
        </div>

        {timings_ms && (
          <div className="font-mono text-[10px] text-[#a8a29e] flex items-center gap-2">
            <span>Retrieval: {timings_ms.retrieve}ms</span>
            <span>·</span>
            <span>Gen: {timings_ms.generate}ms</span>
            <span>·</span>
            <span className="font-bold text-[#1c1917]">
              Total: {timings_ms.total}ms
            </span>
          </div>
        )}
      </div>

      {/* Fast Abstention Notice if Gate Triggered */}
      {gate_triggered && (
        <div className="my-3 p-3 bg-[#fff7ed] border-l-3 border-[#f97316] text-[#9a3412] font-serif text-[13px]">
          <span className="font-mono text-[10px] uppercase font-bold block mb-0.5 tracking-wide text-[#c2410c]">
            Pre-LLM Confidence Gate Fast-Abstention (~1ms · 0 Tokens)
          </span>
          Top retrieved passage score was below the calibrated threshold. Fast-abstained
          to prevent ungrounded generation.
        </div>
      )}

      {/* Abstention Explanation */}
      {isAbstain && abstention_reason && !gate_triggered && (
        <div className="my-3 p-3 bg-[#f5f5f4] border-l-3 border-[#78716c] text-[#44403c] font-serif text-[13px]">
          <span className="font-mono text-[10px] uppercase font-bold block mb-0.5 tracking-wide text-[#57534e]">
            Abstention Rationale
          </span>
          {abstention_reason}
        </div>
      )}

      {/* Synthesis Answer Body */}
      <div className="py-4">
        <h3
          className="text-[19px] font-bold text-[#1c1917] mb-2"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {isAbstain ? "Corpus Abstention Notice" : "Synthesized Research Finding"}
        </h3>
        <p className="font-serif text-[17px] text-[#1c1917] leading-relaxed whitespace-pre-line font-normal">
          {answer}
        </p>
      </div>

      {/* Verified Bibliographic Citations Ledger */}
      {references.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-[#f0ebe1]">
          <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#78716c] font-bold mb-2.5 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-[#001d5f]">
              fact_check
            </span>
            Verified Passages ({references.length})
          </h4>

          <div className="space-y-2">
            {references.map((ref, idx) => {
              const isSelected = selectedCitationChunkId === ref.chunkId;
              return (
                <div
                  key={ref.chunkId}
                  onClick={() => onSelectCitation(ref.chunkId)}
                  className={`p-2.5 border transition-all cursor-pointer text-[12px] ${
                    isSelected
                      ? "bg-[#fff9f2] border-[#fe6f3b] shadow-2xs"
                      : "bg-[#faf8f5] border-[#e7e2d7] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[10px] mb-1">
                    <span className="font-bold text-[#001d5f]">
                      [{idx + 1}] {ref.docId} (p.{ref.page})
                    </span>
                    <span className="text-[#a8a29e]">
                      {ref.chunkId.slice(0, 16)}...
                    </span>
                  </div>
                  {ref.quote && (
                    <p className="italic text-[#57534e] text-[13px] leading-snug line-clamp-2">
                      &ldquo;{ref.quote}&rdquo;
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}
