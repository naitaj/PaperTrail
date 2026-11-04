import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDocumentProxy, extractText } from "unpdf";
import { chunkDocument } from "@/lib/ingest/chunk";

export const maxDuration = 30;

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\x00/g, "")
    // Join hyphenated line breaks (e.g., "retriev-\nal" -> "retrieval")
    .replace(/(\w+)-\n(\w+)/g, "$1$2")
    // Collapse excess whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const customTitle = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF documents are supported." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json({ error: "The uploaded PDF file is empty." }, { status: 400 });
    }

    // SHA-256 of the raw file
    const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // Extract pages via unpdf (zero native dependencies, serverless & Vercel ready)
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdf = await getDocumentProxy(uint8Array);
    const { text: pageTexts, totalPages } = await extractText(pdf, { mergePages: false });

    if (!pageTexts || (Array.isArray(pageTexts) && pageTexts.length === 0)) {
      return NextResponse.json(
        { error: "Could not extract text from PDF. The document may be scanned or image-only." },
        { status: 400 }
      );
    }

    // Process pages
    const rawPages: string[] = Array.isArray(pageTexts) ? pageTexts : [pageTexts];
    const pages: { pageIndex: number; text: string; charCount: number }[] = [];
    let fullText = "";

    for (let i = 0; i < rawPages.length; i++) {
      const pageIndex = i + 1;
      const cleaned = cleanText(rawPages[i] || "");
      if (cleaned.length > 0) {
        pages.push({
          pageIndex,
          text: cleaned,
          charCount: cleaned.length,
        });
        fullText += cleaned + "\n\n";
      }
    }

    if (pages.length === 0 || fullText.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            "Extracted text is too short or empty. Please ensure the PDF contains selectable digital text.",
        },
        { status: 400 }
      );
    }

    const textHash = crypto.createHash("sha256").update(fullText).digest("hex");

    // Derive document title & ID
    const baseSlug = slugify(file.name.replace(/\.pdf$/i, "")) || "uploaded-paper";
    const docId = `user-${baseSlug}-${fileSha256.slice(0, 8)}`.slice(0, 60);
    const title =
      customTitle?.trim() ||
      file.name
        .replace(/\.pdf$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // Generate page-bounded chunks (ck256)
    const chunks = await chunkDocument(
      docId,
      pages.map((p) => ({ pageIndex: p.pageIndex, text: p.text })),
      "ck256"
    );

    return NextResponse.json({
      success: true,
      doc: {
        doc_id: docId,
        title,
        authors: ["User Upload"],
        year: new Date().getFullYear(),
        venue: "In-Browser Workspace",
        doi: null,
        source_url: `upload://${file.name}`,
        sha256: fileSha256,
        text_hash: textHash,
        n_pages: pages.length,
        status: "parsed",
        corpus_version: "user-upload",
      },
      pages: pages.map((p) => ({
        page_index: p.pageIndex,
        char_count: p.charCount,
      })),
      chunks,
      total_chunks: chunks.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF parse error:", message);
    return NextResponse.json(
      { error: "Failed to parse PDF document", detail: message },
      { status: 500 }
    );
  }
}

