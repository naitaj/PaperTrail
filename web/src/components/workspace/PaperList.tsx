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
    <div className="w-full h-full flex flex-col justify-between bg-[#f7f4ee]">
      {/* Header & Filter */}
      <div className="p-3.5 border-b border-[#e7e2d7] bg-[#fcfbf9] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#57534e] font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#001d5f]">
              library_books
            </span>
            Corpus Index
          </span>
          <span className="font-mono text-[10px] bg-[#001d5f]/10 text-[#001d5f] px-2 py-0.5 rounded-xs font-semibold">
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
            className="w-full bg-white border border-[#e7e2d7] px-2.5 py-1.5 pr-7 font-mono text-[11px] text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#001d5f]"
          />
          <span className="material-symbols-outlined absolute right-2 top-2 text-[15px] text-[#a8a29e] pointer-events-none">
            search
          </span>
        </div>

        {/* Scope Toggle */}
        <div className="grid grid-cols-2 gap-1 bg-[#ede8df] p-0.5 text-[11px] font-mono">
          <button
            onClick={() => onSelectScope(null)}
            className={`py-1 px-2 text-center uppercase tracking-wider transition-colors ${
              selectedScope === null
                ? "bg-white text-[#001d5f] font-bold shadow-xs"
                : "text-[#78716c] hover:text-[#1c1917]"
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
            className={`py-1 px-2 text-center uppercase tracking-wider transition-colors ${
              selectedScope !== null
                ? "bg-white text-[#001d5f] font-bold shadow-xs"
                : "text-[#78716c] hover:text-[#1c1917]"
            }`}
          >
            Single Paper
          </button>
        </div>
      </div>

      {/* Paper List Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#ede8df]">
        {filteredDocs.length === 0 ? (
          <div className="p-6 text-center font-mono text-[11px] text-[#a8a29e]">
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
                className={`p-3 transition-colors cursor-pointer border-l-2 group ${
                  isSelected
                    ? "bg-white border-l-[#001d5f] shadow-xs"
                    : "hover:bg-white/80 border-l-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-[#78716c] mb-1">
                  <span className="text-[#001d5f] font-semibold tracking-wider">
                    [{arXivTag}]
                  </span>
                  {doc.source_url && (
                    <a
                      href={doc.source_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-[#001d5f] hover:underline"
                    >
                      PDF ↗
                    </a>
                  )}
                </div>

                <h3 className="font-serif text-[14px] font-semibold text-[#1c1917] group-hover:text-[#001d5f] leading-snug line-clamp-2">
                  {doc.title || doc.doc_id}
                </h3>

                <p className="font-serif text-[12px] text-[#78716c] mt-1 line-clamp-1">
                  {doc.authors && doc.authors.length > 0
                    ? doc.authors.join(", ")
                    : "Authors N/A"}
                </p>

                <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] text-[#a8a29e]">
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
      <div className="px-3.5 py-2.5 border-t border-[#e7e2d7] bg-[#fcfbf9] flex items-center justify-between text-[11px] font-mono text-[#78716c]">
        <span>Scope:</span>
        <span className="font-semibold text-[#001d5f]">
          {selectedScope ? "1 Focused" : "12 Active"}
        </span>
      </div>
    </div>
  );
}
