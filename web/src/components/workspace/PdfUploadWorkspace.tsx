"use client";

import { useState, useEffect, useRef, DragEvent, ChangeEvent } from "react";
import { Header } from "./Header";
import { DocumentItem } from "./PaperList";
import { QuestionForm } from "./QuestionForm";
import { AnswerPanel, AnswerResponse } from "./AnswerPanel";
import { EvidencePanel } from "./EvidencePanel";
import { embedQueryClient, embedBatchClient } from "@/lib/retrieval/clientEmbedding";

interface ParseResponseChunk {
  chunk_id: string;
  doc_id: string;
  config_id: string;
  page_start: number;
  page_end: number;
  ordinal: number;
  section_title: string | null;
  text: string;
  text_hash: string;
  token_count: number;
  lex_len: number;
  is_references: boolean;
}

interface ParseResponseDoc {
  doc_id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  doi: string | null;
  source_url: string;
  sha256: string;
  text_hash: string;
  n_pages: number;
  status: string;
  corpus_version: string;
}

export function PdfUploadWorkspace() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitationChunkId, setSelectedCitationChunkId] = useState<string | null>(null);
  const [hasExecutedQuery, setHasExecutedQuery] = useState(false);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: string;
    percent: number;
    detail?: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok && !ignore) {
          const data = await res.json();
          const allDocs: DocumentItem[] = data.documents || [];
          const userDocs = allDocs.filter(
            (d) =>
              d.doc_id.startsWith("user-") ||
              d.source_url?.startsWith("upload://") ||
              d.venue === "In-Browser Workspace"
          );
          setDocuments(userDocs);
          setSelectedDocId((current) => current || (userDocs.length > 0 ? userDocs[0].doc_id : null));
        }
      } catch (err) {
        console.error("Failed to load documents:", err);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document and all its indexed data?")) {
      return;
    }
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.doc_id !== docId));
        if (selectedDocId === docId) {
          setSelectedDocId(null);
          setResponse(null);
          setHasExecutedQuery(false);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || err.error || "Failed to delete document");
      }
    } catch (e) {
      console.error("Failed to delete doc:", e);
      alert("Error deleting document");
    }
  };

  const handleFileProcess = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setUploadError("Please upload a valid PDF document (.pdf).");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress({
      stage: "Parsing Document",
      percent: 15,
      detail: "Extracting pages & normalising text...",
    });

    try {
      // Step 1: Parse and chunk on the server
      const formData = new FormData();
      formData.append("file", file);

      const parseRes = await fetch("/api/documents/parse", {
        method: "POST",
        body: formData,
      });

      if (!parseRes.ok) {
        const errJson = await parseRes.json().catch(() => ({}));
        const msg = errJson.detail
          ? `${errJson.error}: ${errJson.detail}`
          : errJson.error || `Server returned ${parseRes.status}`;
        throw new Error(msg);
      }

      const parseData: {
        doc: ParseResponseDoc;
        pages: { page_index: number; char_count: number }[];
        chunks: ParseResponseChunk[];
        total_chunks: number;
      } = await parseRes.json();

      setUploadProgress({
        stage: "Neural Embedding",
        percent: 45,
        detail: `Embedding ${parseData.chunks.length} chunks via all-MiniLM-L6-v2...`,
      });

      // Step 2: Compute 384-d dense vectors in browser using Xenova ONNX
      const chunkTexts = parseData.chunks.map((c) => c.text);
      const embeddings = await embedBatchClient(chunkTexts, (current, total) => {
        const pct = 45 + Math.round((current / total) * 35);
        setUploadProgress({
          stage: "Neural Embedding",
          percent: pct,
          detail: `Embedded chunk ${current} of ${total} (384-d vectors)...`,
        });
      });

      setUploadProgress({
        stage: "Vector Indexing",
        percent: 85,
        detail: "Indexing passages and vectors in Supabase PostgreSQL...",
      });

      // Step 3: Save atomically to database
      const saveRes = await fetch("/api/documents/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc: parseData.doc,
          pages: parseData.pages,
          chunks: parseData.chunks,
          embeddings,
        }),
      });

      if (!saveRes.ok) {
        const saveErrJson = await saveRes.json().catch(() => ({}));
        const msg = saveErrJson.detail
          ? `${saveErrJson.error}: ${saveErrJson.detail}`
          : saveErrJson.error || "Failed to save document";
        throw new Error(msg);
      }

      setUploadProgress({
        stage: "Complete",
        percent: 100,
        detail: `Successfully indexed ${parseData.doc.title}!`,
      });

      // Refresh list and select new document
      setRefreshKey((k) => k + 1);
      setSelectedDocId(parseData.doc.doc_id);
      setResponse(null);
      setHasExecutedQuery(false);

      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", msg);
      setUploadError(msg);
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

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

      if (retriever === "embedding") {
        try {
          queryVector = await embedQueryClient(query);
        } catch (embedErr) {
          console.error("Client embedding error:", embedErr);
          throw new Error("Failed to generate query embedding in browser.");
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
          scopeDocId: selectedDocId,
          corpusVersion: "user-upload",
          k: topK,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || `Server returned ${res.status}`);
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

  const selectedDoc = documents.find((d) => d.doc_id === selectedDocId);

  const handleSelectCitation = (chunkId: string) => {
    setSelectedCitationChunkId(chunkId);
    const el = document.getElementById(`chunk-${chunkId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#030407] text-[#f8fafc] font-sans overflow-hidden">
      <Header />

      {/* Main 3-Column Studio Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#1c2233] overflow-hidden">
        {/* Left Column: Uploaded Documents Index & Action */}
        <aside className="lg:col-span-3 xl:col-span-3 h-full overflow-hidden bg-[#06080d] flex flex-col justify-between">
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="p-3.5 border-b border-[#1c2233] bg-[#090b10] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8] font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-[#1558c9]">
                    upload_file
                  </span>
                  Your Uploaded PDFs
                </span>
                <span className="font-mono text-[10px] bg-[#1558c9]/20 text-[#d4ff24] border border-[#1558c9]/40 px-2 py-0.5 rounded-none font-semibold">
                  {documents.length} Custom
                </span>
              </div>

              {/* Upload New PDF Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full bg-[#d4ff24] hover:bg-[#bceb16] text-[#030407] py-2 px-3 font-mono text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-[0_0_12px_rgba(212,255,36,0.2)]"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Upload New PDF</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>

            {/* Document List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#141824]">
              {documents.length === 0 ? (
                <div className="p-6 text-center space-y-3">
                  <div className="w-10 h-10 mx-auto rounded-full bg-[#0c101a] border border-[#1c2233] flex items-center justify-center text-[#1558c9]">
                    <span className="material-symbols-outlined text-[20px]">description</span>
                  </div>
                  <h4 className="font-mono text-[12px] font-bold text-[#f8fafc] uppercase tracking-wider">
                    No Custom PDFs Yet
                  </h4>
                  <p className="font-sans text-[12px] text-[#64748b] leading-relaxed">
                    Upload any research paper or document to index and ask questions.
                  </p>
                </div>
              ) : (
                documents.map((doc) => {
                  const isSelected = doc.doc_id === selectedDocId;
                  return (
                    <div
                      key={doc.doc_id}
                      onClick={() => {
                        setSelectedDocId(doc.doc_id);
                        setResponse(null);
                        setHasExecutedQuery(false);
                      }}
                      className={`p-3.5 transition-all cursor-pointer border-l-2 ${
                        isSelected
                          ? "bg-[#0d121f] border-l-[#d4ff24] text-[#f8fafc]"
                          : "bg-[#06080d] border-l-transparent text-[#94a3b8] hover:bg-[#0a0e17] hover:text-[#f8fafc]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-sans text-[13px] font-semibold leading-snug line-clamp-2 flex-1">
                          {doc.title || doc.doc_id}
                        </h4>
                        <button
                          type="button"
                          title="Delete PDF"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDoc(doc.doc_id);
                          }}
                          className="text-[#64748b] hover:text-red-400 p-1 -mr-1 transition-colors cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[#64748b]">
                        <span className="text-[#1558c9] font-semibold">
                          {doc.n_pages ? `${doc.n_pages} pages` : "Indexed"}
                        </span>
                        <span className="bg-[#1558c9]/20 text-[#d4ff24] px-1.5 py-0.2">ck256</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer note */}
          <div className="p-3 border-t border-[#1c2233] bg-[#090b10] font-mono text-[10px] text-[#64748b]">
            <span>Dual Ingestion: FastEmbed + pgvector</span>
          </div>
        </aside>

        {/* Center Column: Drag & Drop Zone or Query Console */}
        <main className="lg:col-span-6 xl:col-span-6 h-full overflow-y-auto bg-[#030407] p-5 sm:p-7">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* If currently uploading, show upload progress card */}
            {isUploading && uploadProgress && (
              <div className="bg-[#090b10] border border-[#1558c9] p-6 shadow-[0_0_24px_rgba(21,88,201,0.25)] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#d4ff24] font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#d4ff24] animate-ping"></span>
                    {uploadProgress.stage}
                  </span>
                  <span className="font-mono text-[12px] font-bold text-[#f8fafc]">
                    {uploadProgress.percent}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-[#030407] h-2 border border-[#1c2233] overflow-hidden">
                  <div
                    className="bg-[#d4ff24] h-full transition-all duration-300"
                    style={{ width: `${uploadProgress.percent}%` }}
                  ></div>
                </div>

                <p className="font-mono text-[11px] text-[#94a3b8]">{uploadProgress.detail}</p>
              </div>
            )}

            {/* Upload Error Banner */}
            {uploadError && (
              <div className="bg-red-950/20 border border-red-500/40 p-4 font-sans text-red-200 text-[13px] flex items-start gap-2.5">
                <span className="material-symbols-outlined text-red-400 text-[18px]">error</span>
                <div>
                  <strong className="block font-mono text-[11px] uppercase text-red-400">
                    Upload Error
                  </strong>
                  {uploadError}
                </div>
              </div>
            )}

            {/* If no document is selected and none uploaded, show big dropzone */}
            {documents.length === 0 && !isUploading ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-[#d4ff24] bg-[#d4ff24]/5 shadow-[0_0_24px_rgba(212,255,36,0.15)]"
                    : "border-[#1c2233] hover:border-[#1558c9] bg-[#090b10]"
                }`}
              >
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#030407] border border-[#1c2233] flex items-center justify-center text-[#d4ff24]">
                  <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
                </div>
                <h3 className="text-[18px] font-bold text-[#f8fafc] mb-1 font-sans">
                  Drop Custom Research PDF Here
                </h3>
                <p className="font-sans text-[13px] text-[#94a3b8] max-w-md mx-auto mb-4">
                  Drag and drop your own PDF document to automatically slice into page-bounded
                  chunks, generate 384-d dense embeddings, and query it using the verified RAG
                  engine.
                </p>
                <span className="inline-block bg-[#1558c9] text-white font-mono text-[11px] font-bold uppercase tracking-wider px-4 py-2 hover:bg-[#1147a6] transition-colors">
                  Browse Files
                </span>
              </div>
            ) : (
              /* Query Console for Selected Document */
              <>
                <div className="flex items-center justify-between pb-3 border-b border-[#1c2233]">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#d4ff24] font-bold block">
                      Active Scoped Document
                    </span>
                    <h2 className="font-sans text-[16px] font-bold text-[#f8fafc] truncate max-w-xl">
                      {selectedDoc?.title || "All Custom Documents"}
                    </h2>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {selectedDocId && (
                      <button
                        onClick={() => {
                          setSelectedDocId(null);
                          setResponse(null);
                          setHasExecutedQuery(false);
                        }}
                        className="font-mono text-[10px] text-[#d4ff24] hover:underline uppercase font-bold tracking-wider cursor-pointer"
                      >
                        Search all papers
                      </button>
                    )}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="font-mono text-[10px] text-[#1558c9] hover:text-[#d4ff24] uppercase font-bold tracking-wider hover:underline cursor-pointer"
                    >
                      + Upload Another
                    </button>
                  </div>
                </div>

                <QuestionForm
                  onSubmit={handleAsk}
                  isLoading={isLoading}
                  hasAnswer={!!response}
                  lockRetriever="embedding"
                />

                <AnswerPanel
                  response={response}
                  isLoading={isLoading}
                  error={error}
                  selectedCitationChunkId={selectedCitationChunkId}
                  onSelectCitation={handleSelectCitation}
                />
              </>
            )}
          </div>
        </main>

        {/* Right Column: Retrieved Evidence */}
        <aside className="lg:col-span-3 xl:col-span-3 h-full overflow-hidden bg-[#06080d]">
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

