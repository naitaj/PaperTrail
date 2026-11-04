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
          console.error("Client embedding generation error:", embedErr);
          throw new Error(
            "Failed to generate client-side embedding. Please verify your network connection to load the model weights, or select BM25 Lexical retrieval."
          );
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
    <div className="h-screen flex flex-col bg-[#faf8f5] text-[#1c1917] font-serif overflow-hidden">
      <Header />

      {/* Main 3-Column Studio Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#e7e2d7] overflow-hidden">
        {/* Left Column: Archive Index */}
        <aside className="lg:col-span-3 xl:col-span-3 h-full overflow-hidden bg-[#f7f4ee]">
          <PaperList
            documents={documents}
            selectedScope={selectedScope}
            onSelectScope={(id) => setSelectedScope(id)}
          />
        </aside>

        {/* Center Column: Query Console & Grounded Synthesis */}
        <main className="lg:col-span-6 xl:col-span-6 h-full overflow-y-auto bg-[#faf8f5] p-5 sm:p-7">
          <div className="max-w-3xl mx-auto space-y-6">
            <QuestionForm
              onSubmit={handleAsk}
              isLoading={isLoading}
              selectedScopeTitle={selectedDoc ? selectedDoc.title || selectedDoc.doc_id : null}
              onClearScope={() => setSelectedScope(null)}
              hasAnswer={!!response}
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

        {/* Right Column: Evidence Reader */}
        <aside className="lg:col-span-3 xl:col-span-3 h-full overflow-hidden bg-[#f7f4ee]">
          <EvidencePanel
            passages={response?.retrieved || []}
            claims={response?.claims || []}
            selectedCitationChunkId={selectedCitationChunkId}
            onSelectChunk={(id) => setSelectedCitationChunkId(id)}
            hasExecutedQuery={hasExecutedQuery}
          />
        </aside>
      </div>
    </div>
  );
}
