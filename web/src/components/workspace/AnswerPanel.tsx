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
      <div className="bg-[#090b10] border border-[#1c2233] p-8 text-center my-4 space-y-3 rounded-none">
        <div className="inline-block w-7 h-7 border-2 border-[#1558c9] border-t-[#d4ff24] rounded-full animate-spin"></div>
        <h3 className="text-[17px] font-bold text-[#f8fafc] font-sans tracking-wide">
          Synthesizing Grounded Answer
        </h3>
        <p className="font-sans text-[13px] text-[#94a3b8] max-w-sm mx-auto leading-relaxed">
          Retrieving passage vectors, checking confidence bounds, and validating verbatim citation quotes...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-500/40 bg-red-950/20 p-4 text-red-200 my-4 font-sans">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-red-400 mt-0.5">
            error
          </span>
          <div>
            <h3 className="font-mono text-[11px] uppercase font-bold tracking-wider text-red-400">
              Query Error
            </h3>
            <p className="mt-1 text-[13px] text-red-300">{error}</p>
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
    <article className="bg-[#090b10] border border-[#1c2233] p-6 my-2 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
      {/* Top Status Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#1c2233]">
        <span
          className={`font-mono text-[10px] font-bold uppercase px-2.5 py-0.5 tracking-wider ${
            isAbstain
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : isPartial
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "bg-[#d4ff24] text-[#030407] font-extrabold"
          }`}
        >
          {isAbstain ? "ABSTAIN" : isPartial ? "PARTIAL EVIDENCE" : "VERIFIED ANSWER"}
        </span>

        {timings_ms && (
          <span className="font-mono text-[10px] text-[#64748b]">
            {timings_ms.total}ms
          </span>
        )}
      </div>

      {/* Fast Abstention Notice if Gate Triggered */}
      {gate_triggered && (
        <div className="my-3 p-3 bg-amber-950/20 border-l-2 border-amber-500 text-amber-200 font-sans text-[13px]">
          <span className="font-mono text-[10px] uppercase font-bold block mb-0.5 tracking-wide text-amber-400">
            Pre-LLM Confidence Gate Fast-Abstention (~1ms · 0 Tokens)
          </span>
          Top retrieved passage score was below the calibrated threshold. Fast-abstained
          to prevent ungrounded generation.
        </div>
      )}

      {/* Abstention Explanation */}
      {isAbstain && abstention_reason && !gate_triggered && (
        <div className="my-3 p-3 bg-red-950/20 border-l-2 border-red-500 text-red-200 font-sans text-[13px]">
          <span className="font-mono text-[10px] uppercase font-bold block mb-0.5 tracking-wide text-red-400">
            Abstention Rationale
          </span>
          {abstention_reason}
        </div>
      )}

      {/* Synthesis Answer Body */}
      <div className="py-4">
        <h3 className="text-[18px] font-bold text-[#f8fafc] mb-2 font-sans tracking-tight flex items-center gap-2">
          <span className="w-1.5 h-4 bg-[#1558c9]"></span>
          {isAbstain ? "Abstention Notice" : "Synthesized Research Finding"}
        </h3>
        <p className="font-sans text-[15px] text-[#cbd5e1] leading-relaxed whitespace-pre-line font-normal">
          {answer}
        </p>
      </div>

      {/* Verified Bibliographic Citations Ledger */}
      {references.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-[#1c2233]">
          <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold mb-2.5 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-[#1558c9]">
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
                  className={`p-3 border transition-all cursor-pointer text-[12px] ${isSelected
                      ? "bg-[#1558c9]/15 border-[#d4ff24] shadow-[0_0_12px_rgba(212,255,36,0.15)]"
                      : "bg-[#030407] border-[#1c2233] hover:border-[#1558c9]/60 hover:bg-[#0c0e14]"
                    }`}
                >
                  <div className="flex items-center justify-between font-mono text-[10px] mb-1">
                    <span className="font-bold text-[#1558c9] flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#d4ff24]"></span>
                      [{idx + 1}] {ref.docId} (p.{ref.page})
                    </span>
                    <span className="text-[#64748b]">
                      {ref.chunkId.slice(0, 16)}...
                    </span>
                  </div>
                  {ref.quote && (
                    <p className="italic text-[#94a3b8] text-[12px] leading-snug line-clamp-2 pl-2 border-l border-[#1c2233]">
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
