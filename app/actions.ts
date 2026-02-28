"use server";

import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function toInstagramEmbedUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/^\/(p|reel|reels)\/([^/]+)/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/embed/captioned/`;
  } catch {
    return null;
  }
}

type CheerioAPI = ReturnType<typeof cheerio.load>;

function extractMetaContent($: CheerioAPI): string {
  const parts: string[] = [];

  const ogDesc = $('meta[property="og:description"]').attr("content");
  if (ogDesc?.trim()) parts.push(ogDesc.trim());

  const ogTitle = $('meta[property="og:title"]').attr("content");
  if (ogTitle?.trim() && !parts.includes(ogTitle.trim())) parts.push(ogTitle.trim());

  const title = $("title").text().trim();
  if (title && !parts.includes(title)) parts.push(title);

  const metaDesc = $('meta[name="description"]').attr("content");
  if (metaDesc?.trim() && !parts.includes(metaDesc.trim())) parts.push(metaDesc.trim());

  const twitterDesc = $('meta[name="twitter:description"]').attr("content");
  if (twitterDesc?.trim() && !parts.includes(twitterDesc.trim()))
    parts.push(twitterDesc.trim());

  const twitterTitle = $('meta[name="twitter:title"]').attr("content");
  if (twitterTitle?.trim() && !parts.includes(twitterTitle.trim()))
    parts.push(twitterTitle.trim());

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() ?? "{}") as Record<string, unknown>;
      const extractFrom = (obj: Record<string, unknown> | unknown[]): void => {
        if (Array.isArray(obj)) {
          for (const item of obj) extractFrom(item as Record<string, unknown>);
          return;
        }
        if (obj && typeof obj === "object") {
          const o = obj as Record<string, unknown>;
          for (const key of ["description", "caption", "articleBody", "name"]) {
            const val = o[key];
            if (typeof val === "string" && val.trim() && !parts.includes(val.trim()))
              parts.push(val.trim());
          }
          for (const v of Object.values(o)) {
            if (typeof v === "object" && v !== null) extractFrom(v as Record<string, unknown>);
          }
        }
      };
      extractFrom(json);
    } catch {
      // ignore invalid JSON-LD
    }
  });

  return parts.join("\n\n").trim();
}

function extractInstagramCaption($: CheerioAPI): string {
  // Strategy 1: CSS class selectors (Instagram embed page structure)
  const captionSelectors = [".Caption", ".CaptionContent", "[class*='Caption']", "[class*='caption']"];
  for (const sel of captionSelectors) {
    const text = $(sel).first().text().trim();
    if (text && text.length > 3 && text !== "Instagram") return text.replace(/\s+/g, " ").trim();
  }

  // Strategy 2: Inline script JSON (Instagram embeds post data in scripts)
  const captionParts: string[] = [];
  $("script").each((_, el) => {
    const html = $(el).html();
    if (!html) return;
    // Match JSON objects or assignments like window.x = {...}
    const jsonMatches = html.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (jsonMatches) {
      for (const m of jsonMatches) {
        try {
          const parsed = JSON.parse(m) as Record<string, unknown>;
          const extractCaption = (obj: unknown): void => {
            if (typeof obj === "string" && obj.length > 3 && obj !== "Instagram") {
              if (!captionParts.includes(obj)) captionParts.push(obj.trim());
              return;
            }
            if (Array.isArray(obj)) {
              for (const item of obj) extractCaption(item);
              return;
            }
            if (obj && typeof obj === "object") {
              const o = obj as Record<string, unknown>;
              for (const key of ["caption", "text", "description", "articleBody"]) {
                const val = o[key];
                if (typeof val === "string" && val.length > 3 && val !== "Instagram")
                  if (!captionParts.includes(val)) captionParts.push(val.trim());
              }
              // Instagram uses nested structure: edge_media_to_caption.edges[0].node.text
              const edges = o.edge_media_to_caption as unknown;
              if (edges && typeof edges === "object") {
                const edgesObj = edges as { edges?: Array<{ node?: { text?: string } }> };
                for (const edge of edgesObj.edges ?? []) {
                  const text = edge?.node?.text;
                  if (typeof text === "string" && text.length > 3 && !captionParts.includes(text))
                    captionParts.push(text.trim());
                }
              }
              for (const v of Object.values(o)) {
                if (typeof v === "object" && v !== null) extractCaption(v);
              }
            }
          };
          extractCaption(parsed);
        } catch {
          // not valid JSON, skip
        }
      }
    }
    // Also try regex for common patterns like "caption":"..." or "text":"..."
    const captionMatch = html.match(/"caption"\s*:\s*"([^"]+)"/);
    if (captionMatch?.[1]) {
      const decoded = captionMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
      if (decoded.length > 3 && !captionParts.includes(decoded)) captionParts.push(decoded);
    }
  });
  if (captionParts.length > 0) return captionParts.join("\n\n").trim();

  // Strategy 3: Fallback to meta tags
  return extractMetaContent($);
}

function extractBodyText($: CheerioAPI): string {
  $("script, style, nav, footer, noscript, iframe").remove();
  const text = $("body").text().trim();
  return text.replace(/\s+/g, " ").trim();
}

export type ParseResult =
  | { success: true; text: string }
  | { success: false; error: string };

export async function parseUrlAction(
  _prevState: ParseResult | null,
  formData: FormData,
): Promise<ParseResult> {
  return parseUrlFromFormData(formData);
}

async function parseUrlFromFormData(formData: FormData): Promise<ParseResult> {
  const urlInput = formData.get("url");
  const url = typeof urlInput === "string" ? urlInput.trim() : "";

  if (!url) {
    return { success: false, error: "Please enter a URL." };
  }

  if (!isValidUrl(url)) {
    return {
      success: false,
      error: "Invalid URL. Only http and https URLs are allowed.",
    };
  }

  try {
    const parsedUrl = new URL(url);
    const isInstagram = parsedUrl.hostname.includes("instagram.com");
    const embedUrl = isInstagram ? toInstagramEmbedUrl(url) : null;
    const fetchUrl = embedUrl ?? url;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Could not fetch URL: ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return {
        success: false,
        error: "URL does not appear to be an HTML page.",
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: "Could not read response body." };
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalSize += value.length;
        if (totalSize > MAX_BODY_SIZE) {
          return {
            success: false,
            error: "Page content is too large.",
          };
        }
        chunks.push(value);
      }
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const fullBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      fullBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    const html = decoder.decode(fullBuffer);

    const $ = cheerio.load(html);

    let text: string;
    if (isInstagram) {
      text = embedUrl ? extractInstagramCaption($) : extractMetaContent($);
    } else {
      text = extractBodyText($);
      if (text.length < 50) {
        const metaText = extractMetaContent($);
        text = metaText || text;
      }
    }

    if (!text) {
      return { success: false, error: "No text content found on the page." };
    }

    return { success: true, text };
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return { success: false, error: "Request timed out." };
      }
      return {
        success: false,
        error: err.message || "Could not fetch URL.",
      };
    }
    return { success: false, error: "Could not fetch URL." };
  }
}
