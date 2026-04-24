import { useState, useCallback, useRef, startTransition } from "react";
import { translateOnePdf } from "./use-pdf-translator";
import JSZip from "jszip";
import { useToast } from "@/hooks/use-toast";

export interface QueueItem {
  id: string;
  file: File;
  status: "queued" | "extracting" | "translating" | "rendering" | "done" | "error";
  progress: { current: number; total: number };
  translatedBlob?: Blob;
  translatedTexts?: string[];
  error?: string;
}

const TRANSLATE_CONCURRENCY = 5;

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

export async function translateClientSide(
  texts: string[],
  target: string,
  source = "auto",
): Promise<string[]> {
  const n = texts.length;
  const out: string[] = new Array(n);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      out[i] = await translateOneString(texts[i]!, target, source);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, n) }, () => worker()),
  );
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
      const url = URL.createObjectURL(item.translatedBlob!);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.file.name.replace(/\.pdf$/i, "")}-translated.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const zip = new JSZip();
    for (const item of doneItems) {
      const baseName = item.file.name.replace(/\.pdf$/i, "");
      zip.file(`${baseName}-translated.pdf`, item.translatedBlob!);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translated-pdfs.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [queue]);

  const downloadItem = useCallback((id: string) => {
    const item = queue.find((i) => i.id === id);
    if (!item || !item.translatedBlob) return;
    const url = URL.createObjectURL(item.translatedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.file.name.replace(/\.pdf$/i, "")}-translated.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [queue]);

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
