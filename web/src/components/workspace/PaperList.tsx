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
    <aside className="w-full h-full bg-[#fff1e5] flex flex-col justify-between border-r border-[#747683]">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Column Header */}
        <div className="p-4 bg-[#ffebd5] border-b border-[#747683]">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-mono text-[13px] uppercase tracking-widest text-[#271904] font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#001d5f]">
                inventory_2
              </span>{" "}
              Archive Index
            </h2>
            <span className="font-mono text-[11px] bg-[#fe6f3b] text-white px-2 py-0.5 border border-[#ab3600] font-bold tracking-wide">
              {documents.length} Papers
            </span>
          </div>
          <p className="font-serif text-[14px] text-[#444652] leading-snug">
            Curated scholarly proofs &amp; foundational peer-reviewed corpora.
          </p>

          {/* Search Filter Input */}
          <div className="mt-2 relative">
            <input
              type="text"
              placeholder="Filter bibliography [author, title, arXiv]..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-[#fff8f4] border border-[#747683] px-2.5 py-1.5 pr-8 font-mono text-[11px] text-[#271904] placeholder:text-[#747683] focus:outline-none focus:border-[#001d5f]"
            />
            <span className="material-symbols-outlined absolute right-2 top-2 text-[16px] text-[#747683] pointer-events-none">
              filter_alt
            </span>
          </div>

          {/* Scope Switcher Toggle */}
          <div className="mt-2.5 grid grid-cols-2 gap-px bg-[#747683] p-px">
            <button
              onClick={() => onSelectScope(null)}
              className={`py-1 px-2 font-mono text-[11px] uppercase tracking-wider text-center font-semibold transition-colors ${
                selectedScope === null
                  ? "bg-[#001d5f] text-white"
                  : "bg-[#fff8f4] text-[#444652] hover:text-[#271904]"
              }`}
            >
              Corpus (All)
            </button>
            <button
              onClick={() => {
                if (selectedScope === null && filteredDocs.length > 0) {
                  onSelectScope(filteredDocs[0].doc_id);
                }
              }}
              className={`py-1 px-2 font-mono text-[11px] uppercase tracking-wider text-center font-semibold transition-colors ${
                selectedScope !== null
                  ? "bg-[#001d5f] text-white"
                  : "bg-[#fff8f4] text-[#444652] hover:text-[#271904]"
              }`}
            >
              Doc Focus
            </button>
          </div>
        </div>

        {/* Archival Paper Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#747683]">
          {filteredDocs.length === 0 ? (
            <div className="p-4 text-center font-mono text-[11px] text-[#747683]">
              No papers match &quot;{filterText}&quot;
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const isSelected = selectedScope === doc.doc_id;
              const arXivTag = doc.doc_id.startsWith("arxiv_")
                ? `[arXiv:${doc.doc_id.replace("arxiv_", "")}]`
                : `[${doc.venue || doc.doc_id.slice(0, 12)}]`;

              return (
                <article
                  key={doc.doc_id}
                  onClick={() => onSelectScope(isSelected ? null : doc.doc_id)}
                  className={`p-3.5 transition-colors cursor-pointer border-l-4 group ${
                    isSelected
                      ? "bg-[#fff8f4] border-l-[#001d5f]"
                      : "bg-[#fff8f4] hover:bg-[#ffebd5] border-l-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={`font-mono text-[11px] font-bold tracking-wider ${
                        isSelected ? "text-[#001d5f]" : "text-[#747683]"
                      }`}
                    >
                      {arXivTag}
                    </span>
                    {doc.source_url && (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-[11px] text-[#001d5f] hover:underline flex items-center gap-0.5"
                      >
                        PDF ↗
                      </a>
                    )}
                  </div>

                  <h3
                    className="font-serif text-[15px] font-semibold text-[#271904] group-hover:text-[#001d5f] transition-colors mt-0.5 leading-snug line-clamp-2"
                    style={{ fontFamily: "'Source Serif 4', serif" }}
                  >
                    {doc.title || doc.doc_id}
                  </h3>

                  <p className="font-serif text-[13px] text-[#444652] mt-1 line-clamp-1">
                    {doc.authors && doc.authors.length > 0
                      ? doc.authors.join(", ")
                      : "Authors N/A"}
                  </p>

                  <div className="flex items-center gap-2 mt-2 font-mono text-[11px] text-[#747683]">
                    <span>{doc.year || "Year N/A"}</span>
                    <span>·</span>
                    <span>{doc.n_pages ? `${doc.n_pages} pp.` : "PDF"}</span>
                    <span>·</span>
                    <span className="text-[#ab3600] font-bold bg-[#ffdbcf] px-1.5 py-0.2 border border-[#747683]/50 text-[10px]">
                      Searchable
                    </span>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* Left Column Footer Utility */}
      <div className="p-3 border-t border-[#747683] bg-[#ffebd5] flex items-center justify-between text-[#444652] font-mono text-[11px]">
        <span className="uppercase tracking-wider">
          Storage: Supabase PostgreSQL / pgvector
        </span>
        <span className="text-[#001d5f] font-bold">
          {selectedScope ? "1 Doc Scoped" : "All 12 Scoped"}
        </span>
      </div>
    </aside>
  );
}
