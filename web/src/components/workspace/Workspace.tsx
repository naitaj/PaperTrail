"use client";

import { useState, useEffect } from "react";
import { Header } from "./Header";
import { PaperList, DocumentItem } from "./PaperList";
import { QuestionForm } from "./QuestionForm";
import { AnswerPanel, AnswerResponse } from "./AnswerPanel";
import { EvidencePanel } from "./EvidencePanel";
import { embedQueryClient } from "@/lib/retrieval/clientEmbedding";

export function Workspace() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedScope, setSelectedScope] = useState<string | null>(null);
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitationChunkId, setSelectedCitationChunkId] = useState<string | null>(null);
  const [hasExecutedQuery, setHasExecutedQuery] = useState(false);

  useEffect(() => {
    async function fetchDocs() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
        }
      } catch (err) {
        console.error("Failed to load documents:", err);
      }
    }
    fetchDocs();
  }, []);

  const handleAsk = async (
    query: string,
    retriever: "lexical" | "embedding",
    chunkConfig: string,
    topK: number = 5
  ) => {
    setIsLoading(true);
    setError(null);
    setSelectedCitationChunkId(null);

    try {
      let queryVector: number[] | undefined;

      // Generate query embedding locally in the browser if dense retriever is chosen
      if (retriever === "embedding") {
        try {
          queryVector = await embedQueryClient(query);
        } catch (embedErr) {
          console.warn("Client embedding fallback:", embedErr);
        }
      }

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          retriever,
          chunkConfig,
          queryVector,
          scopeDocId: selectedScope,
          k: topK,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || `Server responded with ${res.status}`);
      }

      const data: AnswerResponse = await res.json();
      setResponse(data);
      setHasExecutedQuery(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedDoc = documents.find((d) => d.doc_id === selectedScope);

  const handleSelectCitation = (chunkId: string) => {
    setSelectedCitationChunkId(chunkId);
    const el = document.getElementById(`chunk-${chunkId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fff8f4] text-[#271904] font-serif">
      <Header />

      {/* Top Archival Strip / Breadcrumb Ledger */}
      <div
        className="w-full bg-[#ffe4c5] px-6 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#747683] border-l-4"
        style={{ borderLeftColor: "#fe6f3b" }}
      >
        <div className="flex items-center gap-4">
          <span
            className="font-mono text-[11px] uppercase tracking-widest text-[#444652] font-bold"
            style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.14em", fontWeight: 700 }}
          >
            Folio Reference: PTR-2025-09
          </span>
          <span className="text-[#747683]">/</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#001d5f] font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">database</span>
            Active Corpus: Computational Linguistics &amp; RAG Evaluative Tier
          </span>
        </div>
        <div className="flex items-center gap-6 text-[#444652] font-mono text-[11px]">
          <span>
            Ledger Status: <strong className="text-[#001d5f] font-bold">SYNCHRONIZED</strong>
          </span>
          <span>
            Tokens Indexed: <strong className="text-[#271904]">364,810</strong>
          </span>
          <span>
            Verification Engine: <strong className="text-[#271904]">Deterministic L2</strong>
          </span>
        </div>
      </div>

      {/* Primary Broadsheet Three-Column Grid */}
      <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#747683] bg-[#fff8f4]">
        {/* LEFT COLUMN: Archive Index (Paper Collection) */}
        <div className="lg:col-span-3 xl:col-span-3 h-[calc(100vh-170px)] sticky top-0 overflow-hidden">
          <PaperList
            documents={documents}
            selectedScope={selectedScope}
            onSelectScope={(id) => setSelectedScope(id)}
          />
        </div>

        {/* CENTRE COLUMN: Flexible Q&A Workspace */}
        <main className="lg:col-span-6 xl:col-span-6 p-6 flex flex-col justify-between overflow-y-auto min-h-[calc(100vh-170px)]">
          <div className="space-y-6">
            <QuestionForm
              onSubmit={handleAsk}
              isLoading={isLoading}
              selectedScopeTitle={selectedDoc ? selectedDoc.title || selectedDoc.doc_id : null}
              onClearScope={() => setSelectedScope(null)}
            />
            <AnswerPanel
              response={response}
              isLoading={isLoading}
              error={error}
              selectedCitationChunkId={selectedCitationChunkId}
              onSelectCitation={handleSelectCitation}
            />
          </div>
        </main>

        {/* RIGHT COLUMN: Evidence Reader (Idle & Active States) */}
        <div className="lg:col-span-3 xl:col-span-3 h-[calc(100vh-170px)] sticky top-0 overflow-hidden">
          <EvidencePanel
            passages={response?.retrieved || []}
            claims={response?.claims || []}
            selectedCitationChunkId={selectedCitationChunkId}
            onSelectChunk={(id) => setSelectedCitationChunkId(id)}
            hasExecutedQuery={hasExecutedQuery}
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full bg-[#fff1e5] border-t border-[#747683] py-4">
        <div className="w-full px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-[11px] text-[#444652]">
          <div className="flex flex-col gap-1">
            <span
              className="uppercase text-[#001d5f]"
              style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.14em", fontWeight: 800 }}
            >
              PaperTrail Bibliographic Press
            </span>
            <span className="font-serif text-[13px] text-[#444652]">
              Scholarly provenance ledger, automated citation cross-referencing, and truth-evaluations.
            </span>
          </div>
          <div className="flex items-center gap-6 text-[#747683]">
            <span className="border-b border-[#747683]">Archival Invariant v3.8</span>
            <span className="border-b border-[#747683]">ISSN 2940-1122</span>
            <span>© 2025 PaperTrail Foundation</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
