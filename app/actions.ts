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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Savorit/1.0; +https://github.com/savorit)",
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
    $("script, style, nav, footer, noscript, iframe").remove();
    const text = $("body").text().trim();

    if (!text) {
      return { success: false, error: "No text content found on the page." };
    }

    // Normalize whitespace: collapse multiple spaces/newlines
    const normalizedText = text.replace(/\s+/g, " ").trim();

    return { success: true, text: normalizedText };
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
