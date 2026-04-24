import { Router, type IRouter } from "express";
import { TranslateTextsBody, TranslateTextsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

const MAX_CHUNK_CHARS = 4500;

async function translateOne(
  text: string,
  target: string,
  source: string,
): Promise<string> {
  if (!text.trim()) {
    return text;
  }

  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source || "auto");
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Translate request failed with status ${res.status}`);
  }

  const data = (await res.json()) as unknown;

  if (!Array.isArray(data) || !Array.isArray((data as unknown[])[0])) {
    throw new Error("Unexpected translate response shape");
  }

  const segments = (data as unknown[][])[0] as unknown[];
  let out = "";
  for (const seg of segments) {
    if (Array.isArray(seg) && typeof seg[0] === "string") {
      out += seg[0];
    }
  }
  return out;
}

async function translateLong(
  text: string,
  target: string,
  source: string,
): Promise<string> {
  if (text.length <= MAX_CHUNK_CHARS) {
    return translateOne(text, target, source);
  }

  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_CHARS) {
      parts.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf(". ", MAX_CHUNK_CHARS);
    if (cut < MAX_CHUNK_CHARS / 2) {
      cut = remaining.lastIndexOf(" ", MAX_CHUNK_CHARS);
    }
    if (cut <= 0) {
      cut = MAX_CHUNK_CHARS;
    } else {
      cut += 1;
    }
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  const translated: string[] = [];
  for (const p of parts) {
    translated.push(await translateOne(p, target, source));
  }
  return translated.join("");
}

router.post("/translate", async (req, res) => {
  let body;
  try {
    body = TranslateTextsBody.parse(req.body);
  } catch (err) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const source = body.source ?? "auto";

  try {
    const translations: string[] = [];
    for (const text of body.texts) {
      translations.push(await translateLong(text, body.target, source));
    }
    const data = TranslateTextsResponse.parse({ translations });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Translation failed");
    res.status(502).json({ error: "Translation service failed" });
  }
});

export default router;
