import { useState, useCallback, useRef, startTransition } from "react";
import { translateOnePdf } from "./use-pdf-translator";
import JSZip from "jszip";
import { useToast } from "@/hooks/use-toast";

const REVOKE_BLOB_URL_MS = 30_000;

function triggerFileDownloadFromBlobUrl(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, REVOKE_BLOB_URL_MS);
}

export interface QueueItem {
  id: string;
  file: File;
  status: "queued" | "extracting" | "translating" | "rendering" | "done" | "error";
  progress: { current: number; total: number };
  translatedBlob?: Blob;
  translatedTexts?: string[];
  error?: string;
}

const TRANSLATE_CONCURRENCY = 3;
const MAX_BATCH_CHARS = 3800;
const LINE_SEP = "\n";

async function fetchTranslatedChunk(
  chunk: string,
  target: string,
  source: string,
): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source);
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", chunk);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Translation failed");
  const data = await res.json();
  let piece = "";
  if (Array.isArray(data) && Array.isArray(data[0])) {
    for (const seg of data[0]) {
      if (Array.isArray(seg) && typeof seg[0] === "string") piece += seg[0];
    }
  }
  return piece;
}

async function translateOneString(text: string, target: string, source: string): Promise<string> {
  if (!text.trim()) return text;
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 4500) {
    let cut = remaining.lastIndexOf(" ", 4500);
    if (cut <= 0) cut = 4500;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  chunks.push(remaining);
  const parts = await Promise.all(
    chunks.map((chunk) => fetchTranslatedChunk(chunk, target, source)),
  );
  return parts.join("");
}

interface Batch {
  indices: number[];
  combined: string;
}

function buildBatches(texts: string[]): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = { indices: [], combined: "" };

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i] ?? "";
    if (!t.trim() || t.length > MAX_BATCH_CHARS) {
      if (current.indices.length > 0) {
        batches.push(current);
        current = { indices: [], combined: "" };
      }
      batches.push({ indices: [i], combined: t });
      continue;
    }
    const sepLen = current.indices.length === 0 ? 0 : LINE_SEP.length;
    if (current.combined.length + sepLen + t.length > MAX_BATCH_CHARS && current.indices.length > 0) {
      batches.push(current);
      current = { indices: [], combined: "" };
    }
    current.indices.push(i);
    current.combined = current.indices.length === 1 ? t : current.combined + LINE_SEP + t;
  }

  if (current.indices.length > 0) batches.push(current);
  return batches;
}

async function translateBatch(batch: Batch, target: string, source: string): Promise<string[]> {
  if (batch.indices.length === 1) {
    const idx = batch.indices[0]!;
    const out = new Array<string>(1);
    out[0] = await translateOneString(batch.combined, target, source);
    void idx;
    return out;
  }

  const translated = await translateOneString(batch.combined, target, source);
  const parts = translated.split(/\r?\n/);

  if (parts.length === batch.indices.length) {
    return parts;
  }

  // Fallback: line-count mismatch (translator dropped/added newlines).
  // Translate each entry individually to guarantee a 1:1 mapping.
  const sources = batch.combined.split(LINE_SEP);
  const fallback = await Promise.all(
    sources.map((s) => translateOneString(s, target, source)),
  );
  return fallback;
}

export async function translateClientSide(
  texts: string[],
  target: string,
  source = "auto",
): Promise<string[]> {
  const n = texts.length;
  const out: string[] = new Array(n);

  const batches = buildBatches(texts);
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= batches.length) return;
      const batch = batches[i]!;
      const results = await translateBatch(batch, target, source);
      for (let j = 0; j < batch.indices.length; j++) {
        out[batch.indices[j]!] = results[j] ?? texts[batch.indices[j]!]!;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, batches.length) }, () => worker()),
  );

  for (let i = 0; i < n; i++) {
    if (out[i] === undefined) out[i] = texts[i]!;
  }

  return out;
}

export function usePdfQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const { toast } = useToast();
  const stopRef = useRef(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: QueueItem[] = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((f) => ({
        id: Math.random().toString(36).substring(7),
        file: f,
        status: "queued",
        progress: { current: 0, total: 0 },
      }));

    if (newItems.length < files.length) {
      toast({
        title: "Some files ignored",
        description: "Only PDF files are supported.",
        variant: "destructive",
      });
    }

    setQueue((q) => [...q, ...newItems]);
  }, [toast]);

  const removeFile = useCallback((id: string) => {
    setQueue((q) => q.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    stopRef.current = true;
    setQueue([]);
    setIsProcessingQueue(false);
  }, []);

  const updateItem = useCallback((id: string, update: Partial<QueueItem>) => {
    startTransition(() => {
      setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...update } : item)));
    });
  }, []);

  const processQueue = useCallback(
    async (targetLang: string, pageRange: string) => {
      if (isProcessingQueue) return;
      setIsProcessingQueue(true);
      stopRef.current = false;

      for (let i = 0; i < queue.length; i++) {
        if (stopRef.current) break;
        
        const item = queue[i];
        if (!item || item.status === "done" || item.status === "error") continue;

        try {
          updateItem(item.id, { status: "extracting" });

          const PROGRESS_UI_MS = 120;
          let lastPhase: "extracting" | "translating" | "rendering" | undefined;
          let lastEmitAt = 0;

          const onProgress = (current: number, total: number, phase: "extracting" | "translating" | "rendering") => {
            const now = performance.now();
            const phaseChanged = phase !== lastPhase;
            lastPhase = phase;
            const stepComplete = total > 0 && current >= total;
            const atPhaseStart = current === 0;
            if (phaseChanged || stepComplete || atPhaseStart || now - lastEmitAt >= PROGRESS_UI_MS) {
              lastEmitAt = now;
              updateItem(item.id, { progress: { current, total }, status: phase });
            }
          };

          const result = await translateOnePdf({
            file: item.file,
            targetLang,
            pageRange,
            translator: translateClientSide,
            onProgress,
          });

          if (stopRef.current) break;

          updateItem(item.id, {
            status: "done",
            translatedBlob: result.blob,
            translatedTexts: result.plainTexts,
          });
        } catch (error: any) {
          console.error(error);
          updateItem(item.id, { status: "error", error: error.message || "Failed to translate" });
          toast({
            title: `Error translating ${item.file.name}`,
            description: error.message || "An unexpected error occurred.",
            variant: "destructive",
          });
        }
      }

      setIsProcessingQueue(false);
    },
    [queue, isProcessingQueue, updateItem, toast]
  );

  const downloadAll = useCallback(async () => {
    const doneItems = queue.filter((i) => i.status === "done" && i.translatedBlob);
    if (doneItems.length === 0) return;

    if (doneItems.length === 1) {
      const item = doneItems[0]!;
      const blob = item.translatedBlob!;
      if (blob.size === 0) {
        toast({ title: "Empty file", description: "The PDF is empty. Try translating again.", variant: "destructive" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const name = `${item.file.name.replace(/\.pdf$/i, "")}-translated.pdf`;
      triggerFileDownloadFromBlobUrl(url, name);
      return;
    }

    const zip = new JSZip();
    for (const item of doneItems) {
      const baseName = item.file.name.replace(/\.pdf$/i, "");
      zip.file(`${baseName}-translated.pdf`, item.translatedBlob!);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    if (blob.size === 0) {
      toast({ title: "Empty ZIP", description: "Could not build the archive. Try again.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(blob);
    triggerFileDownloadFromBlobUrl(url, "translated-pdfs.zip");
  }, [queue, toast]);

  const downloadItem = useCallback(
    (id: string) => {
      const item = queue.find((i) => i.id === id);
      if (!item || !item.translatedBlob) return;
      if (item.translatedBlob.size === 0) {
        toast({ title: "Empty file", description: "The PDF is empty. Try translating again.", variant: "destructive" });
        return;
      }
      const url = URL.createObjectURL(item.translatedBlob);
      const name = `${item.file.name.replace(/\.pdf$/i, "")}-translated.pdf`;
      triggerFileDownloadFromBlobUrl(url, name);
    },
    [queue, toast],
  );

  return {
    queue,
    isProcessingQueue,
    addFiles,
    removeFile,
    clearQueue,
    processQueue,
    downloadAll,
    downloadItem,
  };
}
