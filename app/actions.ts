"use server";

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { db } from "../db";
import {
  ingredients as ingredientsTable,
  instructions as instructionsTable,
  recipes as recipesTable,
} from "../db/schema";
import { isInstagramUrl } from "../lib/instagram";

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

export type RecipeData = {
  title: string;
  description?: string;
  ingredients: string[];
  instructions: string[];
  images: string[];
  prepTime?: string;
  cookTime?: string;
  servings?: string;
  sourceUrl: string;
};

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

function parseIso8601Duration(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;
  const hours = match[1] ? Number.parseInt(match[1]) : 0;
  const minutes = match[2] ? Number.parseInt(match[2]) : 0;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);
  return parts.length > 0 ? parts.join(" ") : duration;
}

function normalizeInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return [raw].filter(Boolean);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === "string") return obj.text.trim();
        if (typeof obj.name === "string") return obj.name.trim();
        if (Array.isArray(obj.itemListElement)) {
          return normalizeInstructions(obj.itemListElement).join(" ");
        }
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeImages(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.url === "string") return [obj.url];
      }
      return [];
    });
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.url === "string") return [obj.url];
  }
  return [];
}

function extractRecipeFromJsonLd($: CheerioAPI): RecipeData | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const content = $(scripts[i]).html();
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      const candidates: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"]
          ? parsed["@graph"]
          : [parsed];

      for (const candidate of candidates) {
        if (typeof candidate !== "object" || candidate === null) continue;
        const obj = candidate as Record<string, unknown>;
        const type = obj["@type"];
        const isRecipe =
          type === "Recipe" ||
          (Array.isArray(type) && type.includes("Recipe"));
        if (!isRecipe) continue;

        const title = typeof obj.name === "string" ? obj.name.trim() : "";
        if (!title) continue;

        const description =
          typeof obj.description === "string"
            ? obj.description.trim()
            : undefined;

        const ingredients = Array.isArray(obj.recipeIngredient)
          ? (obj.recipeIngredient as unknown[])
              .filter((x): x is string => typeof x === "string")
              .map((x) => x.trim())
              .filter(Boolean)
          : [];

        const instructions = normalizeInstructions(obj.recipeInstructions);
        const images = normalizeImages(obj.image);

        const prepTime =
          typeof obj.prepTime === "string"
            ? parseIso8601Duration(obj.prepTime)
            : undefined;
        const cookTime =
          typeof obj.cookTime === "string"
            ? parseIso8601Duration(obj.cookTime)
            : undefined;

        const servings =
          typeof obj.recipeYield === "string"
            ? obj.recipeYield
            : Array.isArray(obj.recipeYield)
              ? String(obj.recipeYield[0])
              : undefined;

        return {
          title,
          description,
          ingredients,
          instructions,
          images,
          prepTime,
          cookTime,
          servings,
          sourceUrl: "",
        };
      }
    } catch {
      // malformed JSON-LD, continue to next script tag
    }
  }
  return null;
}

function extractRecipeHeuristic($: CheerioAPI, url: string): RecipeData {
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const h1 = $("h1").first().text().trim();
  const title = ogTitle || h1 || new URL(url).hostname;

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    undefined;

  const ogImage = $('meta[property="og:image"]').attr("content");
  const images = ogImage ? [ogImage] : [];

  // Try to find ingredient-like list items
  const ingredientCandidates: string[] = [];
  $(
    '[class*="ingredient" i], [id*="ingredient" i], [aria-label*="ingredient" i]',
  ).each((_, el) => {
    $(el)
      .find("li")
      .each((_, li) => {
        const text = $(li).text().trim();
        if (text) ingredientCandidates.push(text);
      });
  });

  // Try to find instruction-like list items
  const instructionCandidates: string[] = [];
  $(
    '[class*="instruction" i], [id*="instruction" i], [class*="direction" i], [id*="direction" i], [class*="step" i]',
  ).each((_, el) => {
    $(el)
      .find("li, p")
      .each((_, item) => {
        const text = $(item).text().trim();
        if (text) instructionCandidates.push(text);
      });
  });

  return {
    title,
    description,
    ingredients: ingredientCandidates,
    instructions: instructionCandidates,
    images,
    sourceUrl: url,
  };
}

export type ParseResult =
  | { success: true; recipe: RecipeData; id: string }
  | { success: false; error: string };

async function saveRecipe(recipe: RecipeData): Promise<string> {
  const [inserted] = await db
    .insert(recipesTable)
    .values({
      title: recipe.title,
      description: recipe.description ?? null,
      servings: recipe.servings ?? null,
      sourceUrl: recipe.sourceUrl,
      imageUrl: recipe.images[0] ?? null,
      rawCaption: recipe.description ?? "",
    })
    .returning({ id: recipesTable.id });

  if (recipe.ingredients.length > 0) {
    await db.insert(ingredientsTable).values(
      recipe.ingredients.map((name, i) => ({
        recipeId: inserted.id,
        name,
        orderIndex: i,
      })),
    );
  }

  if (recipe.instructions.length > 0) {
    await db.insert(instructionsTable).values(
      recipe.instructions.map((content, i) => ({
        recipeId: inserted.id,
        stepNumber: i + 1,
        content,
      })),
    );
  }

  return inserted.id;
}

function cleanInstagramCaption(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    // Remove trailing junk: "View all X comments", "Like", comment counts
    .filter((l) => !/^(View all \d|Like$|\d+ likes?$)/i.test(l))
    .filter(Boolean);
}

function isJunkLine(line: string): boolean {
  return /^(comment\s+.{0,30}(send|dm|get)|follow\s+me|save\s+this|share\s+this|link\s+in\s+bio|tag\s+a\s+friend|makros?\s+per|macros?\s+per)/i.test(line);
}

// Regex matching section headers in multiple languages (English + Swedish)
const ING_HEADER_RE = /^(?:ingredients?|ingredienser)\b/i;
const INS_HEADER_RE = /^(?:instructions?|directions?|method|steps?|how to make|preparation|tillagning|instruktioner|beredning|s[åa]h[äa]r\s+g[öo]r\s+(?:du|man)|metod)\b/i;
const ING_INLINE_RE = /^(?:ingredients?|ingredienser)\s*[•\-*:]\s*(.*)/i;
const INS_INLINE_RE = /^(?:instructions?|directions?|method|steps?|tillagning|instruktioner|beredning)\s*(\d+[.)]\s*.*)/i;

// Extract servings count from patterns like "(6 portioner)" or "(4-6 servings)"
function extractServingsFromLine(line: string): string | undefined {
  const m = line.match(/\((\d+(?:[–\-]\d+)?)\s*(portioner?|portions?|servings?|personer?)\)/i);
  return m ? `${m[1]} ${m[2]}` : undefined;
}

// Strip leading emoji characters from a string
function stripLeadingEmoji(str: string): string {
  return str.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "").trim() || str.trim();
}

function parseInstagramCaption(caption: string, sourceUrl: string): RecipeData {
  const lines = cleanInstagramCaption(caption);

  let title = "Instagram Recipe";
  let servings: string | undefined;
  const descriptionLines: string[] = [];
  const ingredients: string[] = [];
  const instructions: string[] = [];

  // Find section boundaries
  const ingredientHeaderIdx = lines.findIndex((l) => ING_HEADER_RE.test(l));
  const instructionHeaderIdx = lines.findIndex((l) => INS_HEADER_RE.test(l));

  // Also detect inline section markers like "Ingredients• 1 can..." or "Tillagning: Finhacka..."
  const inlineIngIdx = ingredientHeaderIdx < 0
    ? lines.findIndex((l) => ING_INLINE_RE.test(l))
    : -1;
  const inlineInsIdx = instructionHeaderIdx < 0
    ? lines.findIndex((l) => INS_INLINE_RE.test(l))
    : -1;

  const effectiveIngIdx = ingredientHeaderIdx >= 0 ? ingredientHeaderIdx : inlineIngIdx;
  const effectiveInsIdx = instructionHeaderIdx >= 0 ? instructionHeaderIdx : inlineInsIdx;

  if (effectiveIngIdx >= 0 || effectiveInsIdx >= 0) {
    // Structured caption with section headers
    const headerStart = Math.min(
      ...[effectiveIngIdx, effectiveInsIdx].filter((i) => i >= 0),
    );

    // Extract title and description from lines before the first section header.
    // Try to find a clean recipe title line (short, no "@", not junk, not the first promo line).
    if (headerStart > 0) {
      // Prefer a later short line as the title over the first (often promo-heavy) line
      let bestTitleIdx = 0;
      for (let i = 1; i < headerStart; i++) {
        const l = lines[i];
        if (l.includes("@") || l.startsWith("#") || isJunkLine(l)) continue;
        // Prefer lines that look like a recipe name: short and without typical sentence punctuation
        if (l.length < lines[bestTitleIdx].length && !l.includes("!") && !l.includes("?")) {
          bestTitleIdx = i;
        }
      }

      // Strip leading emojis and extract servings from the chosen title line
      const rawTitle = lines[bestTitleIdx];
      servings = extractServingsFromLine(rawTitle);
      title = stripLeadingEmoji(rawTitle.replace(/\([^)]*(?:portioner?|portions?|servings?)[^)]*\)/i, "")).trim() || rawTitle;

      for (let i = 0; i < headerStart; i++) {
        if (i === bestTitleIdx) continue;
        const l = lines[i];
        if (!isJunkLine(l) && !l.startsWith("#") && !l.includes("@")) {
          // Also pick up servings from description-area lines if not found yet
          if (!servings) servings = extractServingsFromLine(l);
          descriptionLines.push(stripLeadingEmoji(l));
        }
      }
    }

    // Determine ingredient/instruction ranges
    const ingStart = effectiveIngIdx >= 0 ? effectiveIngIdx : -1;
    const insStart = effectiveInsIdx >= 0 ? effectiveInsIdx : -1;

    if (ingStart >= 0) {
      const ingEnd = insStart > ingStart ? effectiveInsIdx : lines.length;
      const headerLine = lines[ingStart];
      const inlineSplit = ING_INLINE_RE.exec(headerLine);
      const startOffset = inlineSplit ? ingStart : ingStart + 1;
      if (inlineSplit?.[1]) ingredients.push(inlineSplit[1].trim());

      for (let i = startOffset; i < ingEnd; i++) {
        if (i === ingStart && inlineSplit) continue;
        const line = lines[i].replace(/^[-•·◦▪⁃*]\s*/, "").trim();
        if (!line || line.startsWith("#") || isJunkLine(line)) continue;
        ingredients.push(line);
      }
    }

    if (insStart >= 0) {
      const insEnd = ingStart > insStart ? effectiveIngIdx : lines.length;
      const headerLine = lines[insStart];
      const inlineSplit = INS_INLINE_RE.exec(headerLine);
      const startOffset = inlineSplit ? insStart : insStart + 1;
      if (inlineSplit?.[1]) {
        instructions.push(inlineSplit[1].replace(/^\d+[.):\s-]+/, "").trim());
      }

      for (let i = startOffset; i < insEnd; i++) {
        if (i === insStart && inlineSplit) continue;
        const line = lines[i]
          .replace(/^(?:step\s*)?\d+[.):\s-]+/i, "")
          .replace(/^[-•·◦▪⁃*]\s*/, "")
          .trim();
        if (!line || line.startsWith("#") || isJunkLine(line)) break;
        instructions.push(line);
      }
    }
  } else {
    // Unstructured caption — use heuristics
    title = stripLeadingEmoji(lines[0]);
    servings = extractServingsFromLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("#") || isJunkLine(line)) continue;
      if (/^[-•·◦▪⁃*]\s/.test(line)) {
        ingredients.push(line.replace(/^[-•·◦▪⁃*]\s*/, "").trim());
      } else if (/^\d+[.)]\s/.test(line)) {
        instructions.push(line.replace(/^\d+[.)]\s*/, "").trim());
      } else {
        descriptionLines.push(line);
      }
    }
  }

  return {
    title,
    description: descriptionLines.filter(Boolean).join("\n") || undefined,
    ingredients,
    instructions,
    images: [],
    servings,
    sourceUrl,
  };
}

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
    if (isInstagramUrl(url)) {
      const res = await fetch("http://localhost:3000/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as
        | { caption: string; imageUrl: string | null }
        | { error: string };

      if ("error" in data) {
        return { success: false, error: data.error };
      }

      const recipe = parseInstagramCaption(data.caption, url);
      if (data.imageUrl) recipe.images.push(data.imageUrl);
      const id = await saveRecipe(recipe);
      return { success: true, recipe, id };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
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
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
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

    const jsonLdRecipe = extractRecipeFromJsonLd($);
    if (jsonLdRecipe) {
      jsonLdRecipe.sourceUrl = url;
      const id = await saveRecipe(jsonLdRecipe);
      return { success: true, recipe: jsonLdRecipe, id };
    }

    // Remove noise before heuristic extraction
    $("script, style, nav, footer, noscript, iframe").remove();
    const recipe = extractRecipeHeuristic($, url);
    const id = await saveRecipe(recipe);

    return { success: true, recipe, id };
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
