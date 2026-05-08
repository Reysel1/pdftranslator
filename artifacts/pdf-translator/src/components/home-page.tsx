"use client";

import { useState, useRef, useEffect } from "react";
import {
  FileText,
  Languages,
  Loader2,
  Download,
  RotateCcw,
  AlertCircle,
  Trash2,
  Plus,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePdfQueue } from "@/hooks/use-pdf-queue";
import { cn } from "@/lib/utils";
import {
  getMessages,
  htmlLang,
  readStoredLocale,
  storeLocale,
  UI_PAGE_LANGS,
  type Messages,
  type UiLocale,
} from "@/lib/ui-i18n";

const PDF_TARGET_LANGS = [
  { label: "Spanish", value: "es" },
  { label: "English", value: "en" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Italian", value: "it" },
  { label: "Portuguese", value: "pt" },
  { label: "Dutch", value: "nl" },
  { label: "Catalan", value: "ca" },
  { label: "Galician", value: "gl" },
];

const surface =
  "rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800/90 dark:bg-[#121212] dark:shadow-none";

const field =
  "h-11 rounded-xl border border-zinc-200/90 bg-zinc-50 text-zinc-900 shadow-none dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:text-zinc-100 dark:placeholder:text-zinc-500";

const labelCl = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

function PageLanguageMenu({
  value,
  onChange,
  m,
}: {
  value: UiLocale;
  onChange: (l: UiLocale) => void;
  m: Messages;
}) {
  const current = UI_PAGE_LANGS.find((x) => x.value === value) ?? UI_PAGE_LANGS[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center gap-1 rounded-full border border-zinc-200/80 bg-zinc-100 px-2.5 text-xs font-medium text-zinc-800 transition dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Globe className="h-3.5 w-3.5 opacity-80" />
          <span className="max-w-[4rem] truncate sm:inline">{current.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[200] min-w-[10rem]">
        <div className="px-2 py-1.5 text-xs font-medium text-zinc-500">{m.navPageLang}</div>
        {UI_PAGE_LANGS.map((o) => (
          <DropdownMenuItem key={o.value} className="cursor-pointer" onClick={() => onChange(o.value)}>
            {o.label}
            {o.value === value ? <span className="ml-auto text-zinc-400">✓</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileUploadGlyph({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex h-16 w-16 shrink-0 items-center justify-center", className)}>
      <FileText
        className="h-9 w-9 text-zinc-500 dark:text-zinc-500"
        strokeWidth={1.5}
      />
      <span
        className="absolute bottom-0.5 right-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
        aria-hidden
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    </div>
  );
}

export default function HomePage() {
  const [uiLocale, setUiLocale] = useState<UiLocale>(() => readStoredLocale());
  const [isDragging, setIsDragging] = useState(false);
  const [targetLang, setTargetLang] = useState<string>("es");
  const [pageRange, setPageRange] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const m = getMessages(uiLocale);

  useEffect(() => {
    const bundle = getMessages(uiLocale);
    storeLocale(uiLocale);
    document.documentElement.lang = htmlLang(uiLocale);
    document.title = bundle.documentTitle;
  }, [uiLocale]);

  const {
    queue,
    isProcessingQueue,
    addFiles,
    removeFile,
    clearQueue,
    processQueue,
    downloadAll,
    downloadItem,
  } = usePdfQueue();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const hasQueuedItems = queue.length > 0;
  const allDone = queue.length > 0 && queue.every((i) => i.status === "done" || i.status === "error");

  return (
    <div className="relative min-h-[100dvh] text-foreground">
      <div className="flow-canvas" aria-hidden />
      <div className="relative z-10 isolate">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        <header className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-4">
          <nav className="pointer-events-auto flex w-full max-w-6xl items-center justify-between gap-2 rounded-full border border-zinc-200/90 px-3 py-2 pl-3 shadow-sm backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/90 sm:gap-3 sm:pl-4 text-[18px] font-bold border-t-[#333333e6] border-r-[#333333e6] border-b-[#333333e6] border-l-[#333333e6] bg-[#141212e6]">
            <a href="#panel" className="flex min-w-0 items-center gap-2.5 text-zinc-900 dark:text-zinc-100">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-950">
                <FileText className="h-4 w-4 text-zinc-700 dark:text-zinc-200" strokeWidth={2} />
                <Globe
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-sm border border-zinc-200/90 bg-white text-emerald-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-emerald-400"
                  strokeWidth={2.2}
                  aria-hidden
                />
              </span>
              <span className="text-sm font-semibold tracking-tight">{m.brand}</span>
            </a>
            <div className="hidden flex-1 items-center justify-center gap-1 sm:flex">
              <a
                className="rounded-full px-2.5 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300"
                href="#panel"
              >
                {m.navHome}
              </a>
              <a
                className="rounded-full px-2.5 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300"
                href="#guia"
              >
                {m.navGuide}
              </a>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <PageLanguageMenu value={uiLocale} onChange={setUiLocale} m={m} />
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-24">
          <div id="panel" className="mb-6 scroll-mt-24 text-left">
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
              {m.heroTitle}
            </h1>
            <p className="mt-2 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
              {m.heroBody}
            </p>
          </div>

          <div className="space-y-4">
            <section className={cn("p-5 sm:p-6 lg:p-8", surface)}>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:gap-8">
                <div className="space-y-2">
                  <Label htmlFor="target-lang" className={labelCl}>
                    {m.labelTarget}
                  </Label>
                  <Select value={targetLang} onValueChange={setTargetLang} disabled={isProcessingQueue}>
                    <SelectTrigger id="target-lang" className={field}>
                      <SelectValue placeholder={m.targetPlaceholder} />
                    </SelectTrigger>
                    <SelectContent className="z-[200] max-h-60" position="popper">
                      {PDF_TARGET_LANGS.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="page-range" className={labelCl}>
                    {m.labelPages}
                  </Label>
                  <Input
                    id="page-range"
                    placeholder={m.pagesPlaceholder}
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    disabled={isProcessingQueue}
                    className={field}
                  />
                  <p className="text-xs text-zinc-500">{m.hintPages}</p>
                </div>
              </div>
            </section>

            <section className={cn(surface, !hasQueuedItems && "p-0")} id="queue">
              {!hasQueuedItems && (
                <div
                  className={cn(
                    "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-4 p-8 text-center sm:min-h-[220px] sm:p-10 lg:min-h-[240px] lg:p-12",
                    isDragging
                      ? "bg-zinc-100/90 dark:bg-zinc-800/50"
                      : "bg-zinc-50/30 hover:bg-zinc-100/80 dark:bg-transparent dark:hover:bg-zinc-800/30",
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                >
                  <FileUploadGlyph />
                  <div>
                    <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">{m.dropTitle}</p>
                    <p className="mt-1 max-w-md text-pretty text-sm text-zinc-600 dark:text-zinc-400">{m.dropBody}</p>
                  </div>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500">{m.dropHint}</span>
                </div>
              )}

              {hasQueuedItems && (
                <div className="p-5 sm:p-6 lg:p-8">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{m.queueTitle}</h2>
                    {!isProcessingQueue && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 min-h-8 border-zinc-200/90 bg-transparent px-3.5 py-0 text-xs font-medium leading-none text-zinc-900 !shadow-none dark:border-zinc-600 dark:text-zinc-100"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {m.add}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 min-h-8 px-3.5 py-0 text-xs font-medium leading-none text-destructive hover:bg-destructive/10"
                          onClick={clearQueue}
                        >
                          {m.clear}
                        </Button>
                      </div>
                    )}
                  </div>

                  <ul className="space-y-3">
                    {queue.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-xl border border-zinc-200/90 bg-zinc-100/30 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100"
                              title={item.file.name}
                            >
                              {item.file.name}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {(item.file.size / 1024 / 1024).toFixed(2)} MB
                              {item.status === "error" && <span className="ml-1.5 text-destructive">{m.err}</span>}
                              {item.status === "done" && <span className="ml-1.5 text-emerald-600 dark:text-emerald-500">{m.done}</span>}
                              {item.status === "queued" && <span className="ml-1.5">{m.queued}</span>}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {item.status === "done" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => downloadItem(item.id)}
                                className="h-8 text-xs"
                              >
                                <Download className="h-3.5 w-3.5" />
                                PDF
                              </Button>
                            )}
                            {!isProcessingQueue && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-zinc-500"
                                onClick={() => removeFile(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {(item.status === "extracting" || item.status === "translating" || item.status === "rendering") && (
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-zinc-500">
                              <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-400">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {item.status === "extracting" && m.reading}
                                {item.status === "translating" && m.translating}
                                {item.status === "rendering" && m.generating}
                              </span>
                              {item.progress.total > 0 && (
                                <span>
                                  {item.progress.current} / {item.progress.total}
                                </span>
                              )}
                            </div>
                            <Progress
                              value={item.progress.total > 0 ? (item.progress.current / item.progress.total) * 100 : 0}
                              className="h-1 bg-zinc-200/80 dark:bg-zinc-800"
                            />
                          </div>
                        )}
                        {item.error && (
                          <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {item.error}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>

                  {!isProcessingQueue && !allDone && queue.length > 0 && (
                    <div className="mt-5">
                      <Button
                        type="button"
                        className="h-10 w-full rounded-xl border-0 bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950"
                        onClick={() => processQueue(targetLang, pageRange)}
                      >
                        <Languages className="h-4 w-4" />
                        {m.translateButton(queue.length)}
                      </Button>
                    </div>
                  )}

                  {allDone && (
                    <div className="mt-5 rounded-xl border border-zinc-200/90 bg-zinc-100/40 p-5 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.allDoneTitle}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{m.allDoneSub}</p>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button
                          type="button"
                          className="h-10 flex-1 rounded-xl bg-zinc-900 text-zinc-50 sm:flex-initial sm:px-6 dark:bg-zinc-100 dark:text-zinc-950"
                          onClick={downloadAll}
                        >
                          <Download className="h-4 w-4" />
                          {m.downloadZip}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 flex-1 rounded-xl border-zinc-200 dark:border-zinc-700"
                          onClick={clearQueue}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {m.again}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          <section
            id="guia"
            className="mt-8 scroll-mt-24 rounded-2xl border border-dashed border-zinc-300/90 bg-zinc-100/50 p-4 text-left sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/30"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{m.guideTitle}</h2>
            <ol className="mt-2 max-w-3xl space-y-1.5 text-xs text-zinc-600 sm:text-sm dark:text-zinc-500">
              <li>{m.guide1}</li>
              <li>{m.guide2}</li>
              <li>
                {m.guide3Before}
                <strong className="font-semibold text-zinc-800 dark:text-zinc-300">{m.guideStrong}</strong>
                {m.guide3After}
              </li>
            </ol>
          </section>
        </main>

        <footer className="px-4 pb-8 text-center text-[11px] text-zinc-500 sm:px-6">
          <p>{m.footer}</p>
        </footer>
      </div>
    </div>
  );
}
