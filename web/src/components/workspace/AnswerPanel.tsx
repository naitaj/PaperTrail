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
      <div className="border border-[#747683] bg-[#fff8f4] p-8 text-center my-4">
        <div className="inline-block w-8 h-8 border-3 border-[#001d5f] border-t-transparent rounded-full animate-spin"></div>
        <h3
          className="mt-3 text-[18px] font-bold text-[#271904]"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Searching &amp; Synthesizing Grounded Answer
        </h3>
        <p className="mt-1 font-serif text-[14px] text-[#444652] max-w-md mx-auto">
          Querying Supabase index, evaluating confidence thresholds, and
          verifying chunk citations with verbatim quotes...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-2 border-[#ba1a1a] bg-[#ffdad6] p-4 text-[#93000a] my-4 font-serif">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#ba1a1a]">
            error
          </span>
          <div>
            <h3 className="font-mono text-[12px] uppercase font-bold tracking-wider">
              Execution Interrupted
            </h3>
            <p className="mt-1 text-[14px]">{error}</p>
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
    <div className="border border-[#747683] bg-white p-6 my-4 shadow-none">
      {/* Top Reading Folio Header */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#747683] gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-[11px] font-bold uppercase px-2 py-0.5 tracking-wider text-white ${
              isAbstain
                ? "bg-[#ba1a1a]"
                : isPartial
                ? "bg-[#fe6f3b]"
                : "bg-[#05308c]"
            }`}
          >
            {decision.toUpperCase()}
          </span>
          <span className="font-mono text-[11px] text-[#444652]">
            Model: <strong className="text-[#271904]">{model || "openai/gpt-oss-120b"}</strong>
          </span>
        </div>

        {timings_ms && (
          <div className="font-mono text-[11px] text-[#747683] flex items-center gap-2">
            <span>Retrieval: {timings_ms.retrieve}ms</span>
            <span>·</span>
            <span>Gen: {timings_ms.generate}ms</span>
            <span>·</span>
            <span className="font-bold text-[#271904]">
              Total: {timings_ms.total}ms
            </span>
          </div>
        )}
      </div>

      {/* Fast Abstention Banner if Gate Triggered */}
      {gate_triggered && (
        <div className="my-3 p-3 bg-[#ffdad6] border-l-4 border-[#ba1a1a] text-[#93000a] font-serif text-[14px]">
          <span className="font-mono text-[11px] uppercase font-bold block mb-1">
            Pre-LLM Confidence Gate Fast-Abstention (~1ms · 0 LLM Tokens)
          </span>
          Top retrieved passage score fell below the calibrated threshold. Fast-abstained
          to prevent ungrounded generation.
        </div>
      )}

      {/* Abstention Explanation */}
      {isAbstain && abstention_reason && (
        <div className="my-3 p-3 bg-[#ffe4c5] border-l-4 border-[#fe6f3b] text-[#271904] font-serif text-[14px]">
          <span className="font-mono text-[11px] uppercase font-bold block mb-1 text-[#ab3600]">
            Abstention Rationale
          </span>
          {abstention_reason}
        </div>
      )}

      {/* Synthesis Answer Body */}
      <div className="py-4">
        <h3
          className="text-[20px] font-bold text-[#271904] mb-2"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {isAbstain ? "Corpus Abstention Notice" : "Synthesized Research Finding"}
        </h3>
        <p className="font-serif text-[18px] text-[#271904] leading-relaxed whitespace-pre-line">
          {answer}
        </p>
      </div>

      {/* Verified Bibliographic Citations Ledger */}
      {references.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#747683]">
          <h4 className="font-mono text-[11px] uppercase tracking-widest text-[#444652] font-bold mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#001d5f]">
              fact_check
            </span>
            Verified Chunk Citations ({references.length})
          </h4>

          <div className="divide-y divide-[#c4c5d4] border border-[#c4c5d4] bg-[#fff8f4]">
            {references.map((ref, idx) => {
              const isSelected = selectedCitationChunkId === ref.chunkId;
              return (
                <div
                  key={ref.chunkId}
                  onClick={() => onSelectCitation(ref.chunkId)}
                  className={`p-2.5 transition-colors cursor-pointer text-[13px] font-serif ${
                    isSelected ? "bg-[#ffe4c5]" : "hover:bg-[#ffebd5]"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-bold text-[#05308c]">
                      [{idx + 1}] {ref.docId} (p.{ref.page})
                    </span>
                    <span className="text-[#747683] text-[10px]">
                      {ref.chunkId}
                    </span>
                  </div>
                  {ref.quote && (
                    <p className="italic text-[#444652] mt-1 text-[13px] leading-snug">
                      &ldquo;{ref.quote}&rdquo;
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
