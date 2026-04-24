import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { jsPDF } from "jspdf";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const NON_LATIN_LANGUAGES: string[] = [];

const RENDER_SCALE = 2;
const LINE_GROUP_TOLERANCE = 2;
const YIELD_EVERY_N_PAGES = 6;
const PAGES_PER_CHUNK = 12;

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
  canvas: HTMLCanvasElement;
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
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

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

  const lines = groupItemsIntoLines(items);
  return {
    pageWidth: viewport.width / RENDER_SCALE,
    pageHeight: viewport.height / RENDER_SCALE,
    canvas,
    lines,
    originalPageNumber: pageNum,
  };
}

function renderPageLinesToCanvas(ctx: CanvasRenderingContext2D, page: PageData) {
  for (const line of page.lines) {
    const canvasX = line.x * RENDER_SCALE;
    const canvasYBaseline = page.canvas.height - line.y * RENDER_SCALE;
    const canvasFontSize = line.fontSize * RENDER_SCALE;
    const padding = canvasFontSize * 0.2;
    const boxX = canvasX - padding;
    const boxY = canvasYBaseline - canvasFontSize - padding;
    const boxWidth = line.width * RENDER_SCALE + padding * 2;
    const boxHeight = canvasFontSize + padding * 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    let fontSize = canvasFontSize;
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "alphabetic";
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;

    const maxWidth = line.width * RENDER_SCALE;
    let measured = ctx.measureText(line.text).width;
    const minFontSize = Math.max(canvasFontSize * 0.5, 6);
    while (measured > maxWidth && fontSize > minFontSize) {
      fontSize -= 0.5;
      ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
      measured = ctx.measureText(line.text).width;
    }

    if (measured > maxWidth) {
      const words = line.text.split(/\s+/);
      const lines: string[] = [];
      let current = "";
      for (const w of words) {
        const candidate = current ? current + " " + w : w;
        if (ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = w;
        }
      }
      if (current) lines.push(current);

      const lineHeight = fontSize * 1.05;
      let y = canvasYBaseline;
      for (const l of lines) {
        ctx.fillText(l, canvasX, y);
        y += lineHeight;
      }
    } else {
      ctx.fillText(line.text, canvasX, canvasYBaseline);
    }
  }
}

export async function translateOnePdf({ file, targetLang, translator, pageRange, onProgress }: TranslatePdfOptions): Promise<{ blob: Blob; plainTexts: string[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  const pagesToProcess = parsePageRange(pageRange || "", totalPages);
  const n = pagesToProcess.length;
  if (n === 0) {
    throw new Error("No pages to render");
  }

  const translatedPagePlain: string[] = new Array(n);
  onProgress?.(0, n, "extracting");

  let doc: jsPDF | null = null;
  let isFirstPdfPage = true;

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
      const translatedLines = await translator(page.lines.map((l) => l.text), targetLang, "auto");
      for (let j = 0; j < page.lines.length; j++) {
        page.lines[j]!.text = translatedLines[j] ?? page.lines[j]!.text;
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
      const ctx = page.canvas.getContext("2d");
      if (!ctx) continue;
      renderPageLinesToCanvas(ctx, page);

      const dataUrl = page.canvas.toDataURL("image/jpeg", 0.85);
      if (isFirstPdfPage) {
        doc = new jsPDF({
          unit: "pt",
          format: [page.pageWidth, page.pageHeight],
          orientation: page.pageWidth > page.pageHeight ? "landscape" : "portrait",
        });
        isFirstPdfPage = false;
      } else {
        doc!.addPage(
          [page.pageWidth, page.pageHeight],
          page.pageWidth > page.pageHeight ? "landscape" : "portrait",
        );
      }
      doc!.addImage(
        dataUrl,
        "JPEG",
        0,
        0,
        page.pageWidth,
        page.pageHeight,
        undefined,
        "FAST",
      );
      page.canvas.width = 0;
      page.canvas.height = 0;
      onProgress?.(globalIdx + 1, n, "rendering");
      if (k % YIELD_EVERY_N_PAGES === YIELD_EVERY_N_PAGES - 1 && k < pages.length - 1) {
        await yieldToMain();
      }
    }

    pages.length = 0;
    await yieldToMain();
  }

  if (!doc) {
    throw new Error("No pages to render");
  }

  const blob = doc.output("blob");
  return { blob, plainTexts: translatedPagePlain };
}
