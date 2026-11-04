"use client";

import { useState } from "react";

export interface DocumentItem {
  doc_id: string;
  title: string | null;
  authors: string[] | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  source_url: string;
  n_pages: number | null;
  status: string;
}

interface PaperListProps {
  documents: DocumentItem[];
  selectedScope: string | null;
  onSelectScope: (docId: string | null) => void;
}

export function PaperList({
  documents,
  selectedScope,
  onSelectScope,
}: PaperListProps) {
  const [filterText, setFilterText] = useState("");

  const filteredDocs = documents.filter((doc) => {
    const query = filterText.toLowerCase();
    const titleMatch = (doc.title || "").toLowerCase().includes(query);
    const authorMatch = (doc.authors || []).some((a) =>
      a.toLowerCase().includes(query)
    );
    const docIdMatch = doc.doc_id.toLowerCase().includes(query);
    return titleMatch || authorMatch || docIdMatch;
  });

  return (
    <div className="w-full h-full flex flex-col justify-between bg-[#06080d]">
      {/* Header & Filter */}
      <div className="p-3.5 border-b border-[#1c2233] bg-[#090b10] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8] font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#1558c9]">
              library_books
            </span>
            Corpus Index
          </span>
          <span className="font-mono text-[10px] bg-[#1558c9]/20 text-[#60a5fa] border border-[#1558c9]/40 px-2 py-0.5 rounded-xs font-semibold">
            {documents.length} Papers
          </span>
        </div>

        {/* Filter input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search papers, authors..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full bg-[#030407] border border-[#1c2233] px-2.5 py-1.5 pr-7 font-mono text-[11px] text-[#f8fafc] placeholder:text-[#64748b] focus:outline-none focus:border-[#1558c9] transition-colors"
          />
          <span className="material-symbols-outlined absolute right-2 top-2 text-[15px] text-[#64748b] pointer-events-none">
            search
          </span>
        </div>

        {/* Scope Toggle */}
        <div className="grid grid-cols-2 gap-1 bg-[#030407] border border-[#1c2233] p-0.5 text-[11px] font-mono">
          <button
            onClick={() => onSelectScope(null)}
            className={`py-1 px-2 text-center uppercase tracking-wider transition-all ${
              selectedScope === null
                ? "bg-[#1558c9] text-white font-bold shadow-[0_0_8px_rgba(21,88,201,0.5)]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            Entire Corpus
          </button>
          <button
            onClick={() => {
              if (selectedScope === null && filteredDocs.length > 0) {
                onSelectScope(filteredDocs[0].doc_id);
              }
            }}
            className={`py-1 px-2 text-center uppercase tracking-wider transition-all ${
              selectedScope !== null
                ? "bg-[#1558c9] text-white font-bold shadow-[0_0_8px_rgba(21,88,201,0.5)]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            Single Paper
          </button>
        </div>
      </div>

      {/* Paper List Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#141824]">
        {filteredDocs.length === 0 ? (
          <div className="p-6 text-center font-mono text-[11px] text-[#64748b]">
            No papers match &ldquo;{filterText}&rdquo;
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isSelected = selectedScope === doc.doc_id;
            const arXivTag = doc.doc_id.startsWith("arxiv_")
              ? `arXiv:${doc.doc_id.replace("arxiv_", "").replace("_", ".")}`
              : doc.venue || doc.doc_id.slice(0, 10);

            return (
              <div
                key={doc.doc_id}
                onClick={() => onSelectScope(isSelected ? null : doc.doc_id)}
                className={`p-3 transition-all cursor-pointer border-l-2 group ${
                  isSelected
                    ? "bg-[#101420] border-l-[#d4ff24] shadow-[inset_0_0_12px_rgba(212,255,36,0.05)]"
                    : "bg-[#06080d] hover:bg-[#0c0f17] border-l-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-[#64748b] mb-1">
                  <span className="text-[#60a5fa] font-semibold tracking-wider">
                    [{arXivTag}]
                  </span>
                  {doc.source_url && (
                    <a
                      href={doc.source_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#94a3b8] hover:text-[#d4ff24] hover:underline transition-colors"
                    >
                      PDF ↗
                    </a>
                  )}
                </div>

                <h3 className="font-serif text-[14px] font-semibold text-[#f8fafc] group-hover:text-[#d4ff24] transition-colors leading-snug line-clamp-2">
                  {doc.title || doc.doc_id}
                </h3>

                <p className="font-serif text-[12px] text-[#94a3b8] mt-1 line-clamp-1">
                  {doc.authors && doc.authors.length > 0
                    ? doc.authors.join(", ")
                    : "Authors N/A"}
                </p>

                <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] text-[#64748b]">
                  <span>{doc.year || "N/A"}</span>
                  <span>·</span>
                  <span>{doc.n_pages ? `${doc.n_pages} pp.` : "PDF"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Scope Status */}
      <div className="px-3.5 py-2.5 border-t border-[#1c2233] bg-[#090b10] flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
        <span>Scope:</span>
        <span className="font-semibold text-[#d4ff24]">
          {selectedScope ? "1 Focused" : "12 Active"}
        </span>
      </div>
    </div>
  );
}
