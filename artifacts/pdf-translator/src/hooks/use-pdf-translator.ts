import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const NON_LATIN_LANGUAGES: string[] = [];

const LINE_GROUP_TOLERANCE = 2;
const YIELD_EVERY_N_PAGES = 4;
const PAGES_PER_CHUNK = 12;
const MIN_FONT_SIZE_PT = 5;
const COVER_PADDING_RATIO = 0.18;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface PdfLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface PageData {
  pageWidth: number;
  pageHeight: number;
  lines: PdfLine[];
  originalPageNumber: number;
}

function groupItemsIntoLines(items: PdfTextItem[]): PdfLine[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > LINE_GROUP_TOLERANCE) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: PdfLine[] = [];
  let current: PdfTextItem[] = [];
  let currentY: number | null = null;

  const flush = () => {
    if (current.length === 0) return;
    const xs = current.map((i) => i.x);
    const xes = current.map((i) => i.x + i.width);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xes);
    const height = Math.max(...current.map((i) => i.height));
    const fontSize = Math.max(...current.map((i) => i.fontSize));
    const baselineY = current[0]!.y;
    const text = current
      .map((i) => i.str)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 0) {
      lines.push({
        text,
        x: minX,
        y: baselineY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(height, fontSize),
        fontSize,
      });
    }
    current = [];
  };

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= LINE_GROUP_TOLERANCE) {
      current.push(item);
      currentY = currentY ?? item.y;
    } else {
      flush();
      current.push(item);
      currentY = item.y;
    }
  }
  flush();
  return lines;
}

export function parsePageRange(input: string, totalPages: number): number[] {
  if (!input.trim()) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>();
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = parseInt(m[1]!, 10);
      const b = parseInt(m[2]!, 10);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let p = lo; p <= hi; p++) {
        if (p >= 1 && p <= totalPages) pages.add(p);
      }
    } else if (/^\d+$/.test(trimmed)) {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= totalPages) pages.add(p);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export interface TranslatePdfOptions {
  file: File;
  targetLang: string;
  translator: (texts: string[], target: string, source?: string) => Promise<string[]>;
  pageRange?: string;
  onProgress?: (current: number, total: number, phase: "extracting" | "translating" | "rendering") => void;
}

async function extractPageData(pdf: PDFDocumentProxy, pageNum: number): Promise<PageData> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const items: PdfTextItem[] = [];
  for (const raw of textContent.items) {
    if (!("str" in raw)) continue;
    const item = raw as {
      str: string;
      transform: number[];
      width: number;
      height: number;
    };
    const str = item.str;
    if (!str || !str.trim()) continue;
    const tr = item.transform;
    const fontSize = Math.hypot(tr[2] ?? 0, tr[3] ?? 0) || (item.height ?? 12);
    items.push({
      str,
      x: tr[4] ?? 0,
      y: tr[5] ?? 0,
      width: item.width ?? 0,
      height: item.height ?? fontSize,
      fontSize,
    });
  }

  try {
    page.cleanup();
  } catch {
    // ignore
  }

  const lines = groupItemsIntoLines(items);
  return {
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    lines,
    originalPageNumber: pageNum,
  };
}

// pdf-lib's standard fonts use WinAnsi encoding which can't represent
// every Unicode code point. We strip/replace unsupported chars so drawText
// never throws and the document still gets generated.
function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x00-\x7F\u00A1-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2030\u2039\u203A\u20AC\u2122]/g, "?");
}

function fitFontSize(font: PDFFont, text: string, maxWidth: number, startSize: number): number {
  let size = Math.max(startSize, MIN_FONT_SIZE_PT);
  let width = font.widthOfTextAtSize(text, size);
  while (width > maxWidth && size > MIN_FONT_SIZE_PT) {
    size = Math.max(size - 0.5, MIN_FONT_SIZE_PT);
    width = font.widthOfTextAtSize(text, size);
  }
  return size;
}

function wrapText(font: PDFFont, text: string, maxWidth: number, fontSize: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function translateOnePdf({
  file,
  targetLang,
  translator,
  pageRange,
  onProgress,
}: TranslatePdfOptions): Promise<{ blob: Blob; plainTexts: string[] }> {
  const arrayBuffer = await file.arrayBuffer();

  // pdf-lib mutates the buffer it loads, and we also need it for pdfjs.
  // Pass copies so each parser owns its own bytes.
  const pdfjsBuffer = arrayBuffer.slice(0);
  const pdfLibBuffer = arrayBuffer.slice(0);

  const pdf = await pdfjsLib.getDocument({ data: pdfjsBuffer }).promise;
  const totalPages = pdf.numPages;

  const pagesToProcess = parsePageRange(pageRange || "", totalPages);
  const n = pagesToProcess.length;
  if (n === 0) {
    throw new Error("No pages to render");
  }

  const outDoc = await PDFDocument.load(pdfLibBuffer, { ignoreEncryption: true });
  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);

  const translatedPagePlain: string[] = new Array(n);
  onProgress?.(0, n, "extracting");

  for (let chunkStart = 0; chunkStart < n; chunkStart += PAGES_PER_CHUNK) {
    const chunkEnd = Math.min(chunkStart + PAGES_PER_CHUNK, n);
    const chunkSize = chunkEnd - chunkStart;

    const pages: PageData[] = [];
    for (let k = 0; k < chunkSize; k++) {
      const pageNum = pagesToProcess[chunkStart + k]!;
      const data = await extractPageData(pdf, pageNum);
      pages.push(data);
      onProgress?.(chunkStart + k + 1, n, "extracting");
      if (k % YIELD_EVERY_N_PAGES === YIELD_EVERY_N_PAGES - 1 && k < chunkSize - 1) {
        await yieldToMain();
      }
    }

    if (chunkStart === 0) {
      onProgress?.(0, n, "translating");
    }

    for (let k = 0; k < pages.length; k++) {
      const page = pages[k]!;
      const globalIdx = chunkStart + k;
      if (page.lines.length === 0) {
        translatedPagePlain[globalIdx] = "";
        onProgress?.(globalIdx + 1, n, "translating");
        continue;
      }
      const translatedLines = await translator(
        page.lines.map((l) => l.text),
        targetLang,
        "auto",
      );
      for (let j = 0; j < page.lines.length; j++) {
        const t = translatedLines[j] ?? page.lines[j]!.text;
        page.lines[j]!.text = sanitizeForWinAnsi(t);
      }
      translatedPagePlain[globalIdx] = page.lines.map((l) => l.text).join("\n");
      onProgress?.(globalIdx + 1, n, "translating");
      if (k % YIELD_EVERY_N_PAGES === YIELD_EVERY_N_PAGES - 1 && k < pages.length - 1) {
        await yieldToMain();
      }
    }

    if (chunkStart === 0) {
      onProgress?.(0, n, "rendering");
    }

    for (let k = 0; k < pages.length; k++) {
      const page = pages[k]!;
      const globalIdx = chunkStart + k;
      const pdfPage = outDoc.getPage(page.originalPageNumber - 1);

      for (const line of page.lines) {
        if (!line.text) continue;

        const padding = Math.max(line.fontSize * COVER_PADDING_RATIO, 1);
        const boxX = line.x - padding;
        const boxY = line.y - padding;
        const boxWidth = line.width + padding * 2;
        const boxHeight = line.fontSize + padding * 2;

        // Cover the original glyphs with an opaque white rectangle.
        pdfPage.drawRectangle({
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: boxHeight,
          color: rgb(1, 1, 1),
          borderWidth: 0,
        });

        const maxWidth = line.width;
        const startSize = Math.max(line.fontSize, MIN_FONT_SIZE_PT);
        let size = fitFontSize(helvetica, line.text, maxWidth, startSize);
        const fits = helvetica.widthOfTextAtSize(line.text, size) <= maxWidth;

        if (fits) {
          pdfPage.drawText(line.text, {
            x: line.x,
            y: line.y,
            size,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
        } else {
          // Translation is too long even at min size. Wrap onto multiple
          // sublines using the original font size as the line height.
          size = MIN_FONT_SIZE_PT;
          const wrapped = wrapText(helvetica, line.text, maxWidth, size);
          const lineHeight = size * 1.1;
          let y = line.y;
          for (const segment of wrapped) {
            pdfPage.drawText(segment, {
              x: line.x,
              y,
              size,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
            y -= lineHeight;
          }
        }
      }

      onProgress?.(globalIdx + 1, n, "rendering");
      if (k % YIELD_EVERY_N_PAGES === YIELD_EVERY_N_PAGES - 1 && k < pages.length - 1) {
        await yieldToMain();
      }
    }

    pages.length = 0;
    await yieldToMain();
  }

  // If a page range was provided and it doesn't cover the whole document,
  // strip pages that weren't requested. Remove from highest index downwards.
  if (n < totalPages) {
    const keep = new Set(pagesToProcess);
    for (let p = totalPages; p >= 1; p--) {
      if (!keep.has(p)) outDoc.removePage(p - 1);
    }
  }

  const bytes = await outDoc.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });

  try {
    await pdf.cleanup();
    await pdf.destroy();
  } catch {
    // ignore cleanup errors
  }

  return { blob, plainTexts: translatedPagePlain };
}
