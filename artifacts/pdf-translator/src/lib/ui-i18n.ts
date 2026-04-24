export type UiLocale = "es" | "en" | "fr";

const STORAGE_KEY = "pdf-translator-ui-locale";

export function readStoredLocale(): UiLocale {
  if (typeof window === "undefined") return "es";
  const s = localStorage.getItem(STORAGE_KEY);
  if (s === "en" || s === "fr" || s === "es") return s;
  const tag = navigator.language?.slice(0, 2).toLowerCase();
  if (tag === "en" || tag === "fr") return tag;
  return "es";
}

export function storeLocale(l: UiLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // ignore
  }
}

export type Messages = {
  documentTitle: string;
  brand: string;
  navSettings: string;
  navGuide: string;
  navPageLang: string;
  theme: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  heroTitle: string;
  heroBody: string;
  labelTarget: string;
  targetPlaceholder: string;
  labelPages: string;
  pagesPlaceholder: string;
  hintPages: string;
  dropTitle: string;
  dropBody: string;
  dropHint: string;
  queueTitle: string;
  add: string;
  clear: string;
  err: string;
  done: string;
  queued: string;
  reading: string;
  translating: string;
  generating: string;
  translateButton: (n: number) => string;
  allDoneTitle: string;
  allDoneSub: string;
  downloadZip: string;
  again: string;
  guideTitle: string;
  guide1: string;
  guide2: string;
  guide3Before: string;
  guide3After: string;
  guideStrong: string;
  footer: string;
};

const es: Messages = {
  documentTitle: "PDF Translator",
  brand: "PDF Translator",
  navSettings: "Ajustes",
  navGuide: "Guía",
  navPageLang: "Página",
  theme: "Tema",
  themeLight: "Claro",
  themeDark: "Oscuro",
  themeSystem: "Sistema",
  heroTitle: "Traducir documentos",
  heroBody:
    "Elige idioma de destino y, si quieres, un rango de páginas. Sube PDF (uno o varios) y pulsa Traducir cuando estén en la cola. Todo ocurre en tu navegador: el archivo no se envía a nuestro servidor.",
  labelTarget: "Idioma de destino",
  targetPlaceholder: "Idioma",
  labelPages: "Páginas (opcional)",
  pagesPlaceholder: "ej. 1-5, 8, 10-12",
  hintPages: "Vacío = todas las páginas.",
  dropTitle: "Subir archivos PDF",
  dropBody:
    "Arrastra los archivos a esta zona o haz clic (o pulsa Entrar) para elegirlos. Puedes añadir varios.",
  dropHint: "Zona de carga",
  queueTitle: "Cola de traducción",
  add: "Añadir",
  clear: "Vaciar",
  err: "Error",
  done: "Listo",
  queued: "En cola",
  reading: "Leyendo…",
  translating: "Traduciendo…",
  generating: "Generando…",
  translateButton: (n) => (n === 1 ? "Traducir 1 archivo" : `Traducir ${n} archivos`),
  allDoneTitle: "Listo",
  allDoneSub: "Descarga o haz otra tanda.",
  downloadZip: "Descargar ZIP",
  again: "Otra tanda",
  guideTitle: "Guía rápida",
  guide1: "1. Elige el idioma de destino (y rango de páginas si quieres).",
  guide2: "2. Sube uno o varios PDF en la tarjeta de abajo.",
  guide3Before: "3. Pulsa ",
  guide3After: " y descarga cuando termine.",
  guideStrong: "Traducir",
  footer: "Gratuito, sin registro. El PDF no se sube a nuestro servidor.",
};

const en: Messages = {
  documentTitle: "PDF Translator",
  brand: "PDF Translator",
  navSettings: "Settings",
  navGuide: "Guide",
  navPageLang: "Page",
  theme: "Theme",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "System",
  heroTitle: "Translate documents",
  heroBody:
    "Choose the target language and, if you like, a page range. Upload one or more PDFs and press Translate when they are in the queue. Everything runs in your browser; your file is not uploaded to our server.",
  labelTarget: "Target language",
  targetPlaceholder: "Language",
  labelPages: "Pages (optional)",
  pagesPlaceholder: "e.g. 1-5, 8, 10-12",
  hintPages: "Empty = all pages.",
  dropTitle: "Upload PDF files",
  dropBody:
    "Drop files here or click (or press Enter) to pick them. You can add several.",
  dropHint: "Upload area",
  queueTitle: "Translation queue",
  add: "Add",
  clear: "Clear",
  err: "Error",
  done: "Done",
  queued: "Queued",
  reading: "Reading…",
  translating: "Translating…",
  generating: "Building…",
  translateButton: (n) => (n === 1 ? "Translate 1 file" : `Translate ${n} files`),
  allDoneTitle: "Done",
  allDoneSub: "Download or start another batch.",
  downloadZip: "Download ZIP",
  again: "Another batch",
  guideTitle: "Quick guide",
  guide1: "1. Choose the target language (and page range if needed).",
  guide2: "2. Upload one or more PDFs in the card below.",
  guide3Before: "3. Press ",
  guide3After: " and download when it finishes.",
  guideStrong: "Translate",
  footer: "Free, no sign-up. Your PDF is not uploaded to our server.",
};

const fr: Messages = {
  documentTitle: "PDF Translator",
  brand: "PDF Translator",
  navSettings: "Réglages",
  navGuide: "Guide",
  navPageLang: "Page",
  theme: "Thème",
  themeLight: "Clair",
  themeDark: "Sombre",
  themeSystem: "Système",
  heroTitle: "Traduire des documents",
  heroBody:
    "Choisissez la langue cible et, si besoin, une plage de pages. Ajoutez un ou plusieurs PDF, puis lancez Traduire. Tout se passe dans le navigateur : le fichier n'est pas envoyé sur nos serveurs.",
  labelTarget: "Langue cible",
  targetPlaceholder: "Langue",
  labelPages: "Pages (optionnel)",
  pagesPlaceholder: "ex. 1-5, 8, 10-12",
  hintPages: "Vide = toutes les pages.",
  dropTitle: "Envoyer des PDF",
  dropBody:
    "Glissez-déposez ici ou cliquez (ou Entrée) pour choisir. Vous pouvez en ajouter plusieurs.",
  dropHint: "Zone d'envoi",
  queueTitle: "File d'attente",
  add: "Ajouter",
  clear: "Vider",
  err: "Erreur",
  done: "Prêt",
  queued: "En file",
  reading: "Lecture…",
  translating: "Traduction…",
  generating: "Génération…",
  translateButton: (n) => (n === 1 ? "Traduire 1 fichier" : `Traduire ${n} fichiers`),
  allDoneTitle: "Terminé",
  allDoneSub: "Téléchargez ou relancez une autre session.",
  downloadZip: "Télécharger ZIP",
  again: "Autre lot",
  guideTitle: "Guide rapide",
  guide1: "1. Choisissez la langue cible (et la plage de pages si besoin).",
  guide2: "2. Importez un ou plusieurs PDF dans la carte ci-dessous.",
  guide3Before: "3. Appuyez sur ",
  guide3After: " et téléchargez quand c'est prêt.",
  guideStrong: "Traduire",
  footer: "Gratuit, sans inscription. Le PDF n'est pas envoyé sur notre serveur.",
};

const bundles: Record<UiLocale, Messages> = { es, en, fr };

export function getMessages(locale: UiLocale): Messages {
  return bundles[locale] ?? es;
}

export const UI_PAGE_LANGS: { value: UiLocale; label: string }[] = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

export function htmlLang(locale: UiLocale): string {
  if (locale === "en") return "en";
  if (locale === "fr") return "fr";
  return "es";
}
