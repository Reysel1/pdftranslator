import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const NON_LATIN_LANGUAGES: string[] = [];

const LINE_GROUP_TOLERANCE = 2;
const YIELD_EVERY_N_PAGES = 4;
const PAGES_PER_CHUNK = 4;
const MIN_FONT_SIZE_PT = 5;
const COVER_PADDING_RATIO = 0.18;
const MAX_RASTER_LONG_SIDE_PX = 1200;
const RENDER_SCALE_CAP = 1.35;
const SAMPLE_BORDER_PX = 2;

type Rgb = { r: number; g: number; b: number };

function normalizePdfLibRgb(s: Rgb) {
  return rgb(s.r / 255, s.g / 255, s.b / 255);
}

function pickTextColorForBackground(s: Rgb) {
  const lum = (0.299 * s.r + 0.587 * s.g + 0.114 * s.b) / 255;
  return lum < 0.42 ? rgb(1, 1, 1) : rgb(0, 0, 0);
}

function rectFromPdfCorners(
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
) {
  const c: [number, number][] = [
    [boxX, boxY],
    [boxX + boxW, boxY],
    [boxX, boxY + boxH],
    [boxX + boxW, boxY + boxH],
  ];
  const canvasPts = c.map(([px, py]) => viewport.convertToViewportPoint(px, py));
  const xs = canvasPts.map((p) => p[0]!);
  const ys = canvasPts.map((p) => p[1]!);
  const l = Math.min(...xs);
  const r = Math.max(...xs);
  const t = Math.min(...ys);
  const b = Math.max(...ys);
  return {
    x: l,
    y: t,
    w: Math.max(1, r - l),
    h: Math.max(1, b - t),
  };
}

function getViewportForBackgroundSample(srcPage: PDFPageProxy): PageViewport {
  const base = srcPage.getViewport({ scale: 1 });
  const long = Math.max(base.width, base.height) || 1;
  const scale = Math.min(RENDER_SCALE_CAP, MAX_RASTER_LONG_SIDE_PX / long);
  return srcPage.getViewport({ scale: Math.max(0.22, scale) });
}

function meanBorderColor(
  imageData: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
  band: number,
): Rgb | null {
  const { data, width: iw, height: ih } = imageData;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(iw, Math.ceil(x + w));
  const y1 = Math.min(ih, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return null;
  const b = Math.max(1, Math.min(band, Math.min(x1 - x0, y1 - y0) >> 1));
  let r = 0;
  let g = 0;
  let bsum = 0;
  let n = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const isBorder = px < x0 + b || px >= x1 - b || py < y0 + b || py >= y1 - b;
      if (!isBorder) continue;
      const i = (py * iw + px) * 4;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      bsum += data[i + 2] ?? 0;
      n++;
    }
  }
  if (n < 1) {
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * iw + px) * 4;
        r += data[i] ?? 0;
        g += data[i + 1] ?? 0;
        bsum += data[i + 2] ?? 0;
        n++;
      }
    }
  }
  if (n < 1) return null;
  return { r: r / n, g: g / n, b: bsum / n };
}

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
  preserve?: boolean;
}

interface PageData {
  pageWidth: number;
  pageHeight: number;
  lines: PdfLine[];
  originalPageNumber: number;
}

function isLikelyUriLikeText(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 3) return false;
  if (/\s/.test(t)) {
    if (
      t.split(/\s+/).length === 1 &&
      (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("www."))
    ) {
      return true;
    }
    return false;
  }
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  if (/^www\.\S+$/i.test(t)) return true;
  if (/^mailto:\S+@\S+$/i.test(t)) return true;
  if (/^mailto:\S+$/i.test(t)) return true;
  if (/^ftp:\/\//i.test(t)) return true;
  if (/^tel:\+?\d[\d\s\-().]+$/i.test(t)) return true;
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s]+$/i.test(t)) return true;
  if (/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(t)) return true;
  return false;
}

function linePdfBbox(line: PdfLine) {
  const fs = line.fontSize;
  const h = Math.max(line.height, fs);
  const L = line.x;
  const R = line.x + line.width;
  const B = line.y - h * 0.35;
  const T = line.y + h * 0.8;
  return { L, R, B, T };
}

function pdfRectsOverlap(
  a: { L: number; R: number; B: number; T: number },
  b: { L: number; R: number; B: number; T: number },
) {
  if (a.R < b.L || a.L > b.R) return false;
  if (a.T < b.B || a.B > b.T) return false;
  return true;
}

function markPreservedFromAnnotations(lines: PdfLine[], linkRects: number[][] | undefined) {
  for (const line of lines) {
    if (isLikelyUriLikeText(line.text)) {
      line.preserve = true;
      continue;
    }
    if (!linkRects || linkRects.length === 0) continue;
    const b = linePdfBbox(line);
    for (const r of linkRects) {
      if (r.length < 4) continue;
      const L = r[0] ?? 0;
      const B = r[1] ?? 0;
      const R = r[2] ?? 0;
      const T = r[3] ?? 0;
      const Ln = Math.min(L, R);
      const Rx = Math.max(L, R);
      const Bn = Math.min(B, T);
      const Tn = Math.max(B, T);
      if (pdfRectsOverlap(b, { L: Ln, R: Rx, B: Bn, T: Tn })) {
        line.preserve = true;
        break;
      }
    }
  }
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
  let linkRects: number[][] = [];
  try {
    const annotations = await page.getAnnotations();
    for (const a of annotations) {
      if (a.subtype === "Link" && Array.isArray(a.rect) && a.rect.length >= 4) {
        linkRects.push(a.rect as number[]);
      }
    }
  } catch {
    linkRects = [];
  }
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
  markPreservedFromAnnotations(lines, linkRects);
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
      const translateIdx: number[] = [];
      const batch: string[] = [];
      for (let j = 0; j < page.lines.length; j++) {
        if (page.lines[j]!.preserve) continue;
        translateIdx.push(j);
        batch.push(page.lines[j]!.text);
      }
      const translatedBatch =
        batch.length > 0 ? await translator(batch, targetLang, "auto") : [];
      let bi = 0;
      for (const j of translateIdx) {
        const t = translatedBatch[bi] ?? page.lines[j]!.text;
        bi++;
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

      const srcPage = await pdf.getPage(page.originalPageNumber);
      const view = getViewportForBackgroundSample(srcPage);
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(view.width);
      canvas.height = Math.floor(view.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let imageData: ImageData | null = null;
      if (ctx) {
        try {
          await srcPage.render({ canvasContext: ctx, viewport: view, canvas }).promise;
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch {
          imageData = null;
        }
      }
      try {
        srcPage.cleanup();
      } catch {
        // ignore
      }

      for (const line of page.lines) {
        if (!line.text) continue;
        if (line.preserve) continue;

        const padding = Math.max(line.fontSize * COVER_PADDING_RATIO, 1);
        const boxX = line.x - padding;
        const boxY = line.y - padding;
        const boxWidth = line.width + padding * 2;
        const lineH = Math.max(line.fontSize, line.height);
        const boxHeight = lineH + padding * 2;

        const pr = rectFromPdfCorners(view, boxX, boxY, boxWidth, boxHeight);
        const bgSample =
          imageData !== null
            ? meanBorderColor(imageData, pr.x, pr.y, pr.w, pr.h, SAMPLE_BORDER_PX)
            : null;
        const bgRgb: Rgb = bgSample ?? { r: 255, g: 255, b: 255 };
        const fillColor = normalizePdfLibRgb(bgRgb);
        const textColor = pickTextColorForBackground(bgRgb);

        pdfPage.drawRectangle({
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: boxHeight,
          color: fillColor,
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
            color: textColor,
          });
        } else {
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
              color: textColor,
            });
            y -= lineHeight;
          }
        }
      }

      imageData = null;
      canvas.width = 0;
      canvas.height = 0;

      onProgress?.(globalIdx + 1, n, "rendering");
      await yieldToMain();
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
