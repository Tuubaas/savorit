"use server";

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { eq } from "drizzle-orm";
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
  const existing = await db.query.recipes.findFirst({
    where: eq(recipesTable.sourceUrl, recipe.sourceUrl),
  });
  if (existing) return existing.id;

  const [inserted] = await db
    .insert(recipesTable)
    .values({
      title: recipe.title,
      description: recipe.description ?? null,
      sourceUrl: recipe.sourceUrl,
      imageUrl: recipe.images[0] ?? null,
      servings: recipe.servings ?? null,
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

// ── Instagram caption parsing ──────────────────────────────────────

const JUNK_RE =
  /^(view all \d|like$|\d+ likes?$|liked by|add a comment|log in|sign up|comment\s+.{0,30}(send|dm|get)|follow\s+me|save\s+this|share\s+this|link\s+in\s+bio|tag\s+a\s+friend|double.?tap|dm\s+me|click\s+(the\s+)?link)/i;

const HASHTAG_HEAVY_RE = /^[#@\s\p{Emoji}]+$/u;

function cleanInstagramCaption(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !JUNK_RE.test(l))
    .filter((l) => !HASHTAG_HEAVY_RE.test(l))
    // Lines that are >50% hashtags
    .filter((l) => {
      const tags = l.match(/#\S+/g);
      if (!tags) return true;
      const tagLen = tags.join("").length;
      return tagLen / l.length < 0.5;
    });
}

/** Instagram embeds prepend the username as line 0. Detect and strip it. */
function stripUsername(lines: string[]): string[] {
  if (lines.length < 2) return lines;
  const first = lines[0];
  // Username: single word (or with dots/underscores), no spaces, short
  if (/^[a-zA-Z_][a-zA-Z0-9._]{1,30}$/.test(first) && first.length <= 30) {
    return lines.slice(1);
  }
  return lines;
}

// Multilingual measurement units
const UNITS_RE =
  /\b(msk|tsk|dl|cl|ml|l|krm|st|kopp|paket|tetra|nypa|burk|klyftor?|knippe|cup|cups|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lb|lbs?|pounds?|g|kg|bunch|clove|cloves?|cans?|pinch|dash|pint|quart|gallon|stick|sticks?|head|heads?)\b/i;

const COOKING_VERBS_RE =
  /\b(cook|bake|fry|saut[ée]|boil|simmer|stir|mix|chop|dice|slice|preheat|heat|add|pour|combine|whisk|fold|season|serve|drain|rinse|set aside|remove|place|spread|transfer|reduce|bring|roast|grill|broil|steam|blanch|marinate|toss|garnish|stek|koka|fräs|blanda|skär|hacka|rör|sjud|häll|servera|smaksätt|låt|vänd|avsluta|smält|sila|ringla|tillsätt|krydda|ha\s+i|lägg)\b/i;

const PREP_WORDS_RE =
  /,\s*(finhackad[ea]?|hackad[ea]?|skivad[ea]?|tärnad[ea]?|delad[ea]?|i\s+(bitar|skivor|mindre\s+bitar)|diced|chopped|sliced|minced|grated|julienned|crushed|sköljda|avrunna)\b/i;

const SERVINGS_RE =
  /^(\d+[-–]\d+|\d+)\s*(portioner|servings?|pers(oner)?|portions?)\.?$/i;

const FRACTION_START_RE = /^(\d|½|¼|¾|⅓|⅔|⅛|⅜|⅝|⅞|\d+\/\d+|\d+[.,]\d+)/;

// Swedish/English indefinite quantity words at line start
const INDEF_QTY_RE =
  /^(lite|en\s|ett\s|några|ev\b|eventuellt|a\s+few|some|a\s+handful|a\s+pinch|a\s+dash)/i;

function scoreIngredient(line: string): number {
  let score = 0;
  if (FRACTION_START_RE.test(line)) score += 0.35;
  if (INDEF_QTY_RE.test(line)) score += 0.25;
  if (UNITS_RE.test(line)) score += 0.25;
  if (line.length < 60) score += 0.15;
  if (PREP_WORDS_RE.test(line)) score += 0.1;
  if (/^[-•·◦▪⁃*]\s/.test(line)) score += 0.1;
  // Lowercase start without number often means ingredient too ("olja, till stekning", "salt och peppar")
  if (/^[a-zåäöüé]/.test(line) && line.length < 50) score += 0.1;
  if (COOKING_VERBS_RE.test(line)) score -= 0.3;
  if (line.length > 120) score -= 0.4;
  return Math.max(0, Math.min(1, score));
}

function scoreInstruction(line: string): number {
  let score = 0;
  if (COOKING_VERBS_RE.test(line)) score += 0.3;
  if (line.length > 60) score += 0.2;
  if (/^\d+[.)]\s/.test(line)) score += 0.2;
  if (/\b\d+\s*(min(ut[ea]r|utes?)?|tim(m?ar|e)|hours?|seconds?|sekunder)\b/i.test(line)) score += 0.1;
  if (/\d+\s*°/i.test(line)) score += 0.1;
  // Starts with uppercase imperative (common in instructions)
  if (/^[A-ZÅÄÖ][a-zåäöé]+\s/.test(line) && line.length > 30) score += 0.1;
  return Math.max(0, Math.min(1, score));
}

function extractServings(lines: string[]): { servings: string | undefined; filtered: string[] } {
  let servings: string | undefined;
  const filtered: string[] = [];
  for (const line of lines) {
    const m = SERVINGS_RE.exec(line);
    if (m && !servings) {
      servings = m[0];
    } else {
      filtered.push(line);
    }
  }
  return { servings, filtered };
}

function splitIntoSentences(text: string): string[] {
  // Split on ". " followed by an uppercase letter, or on "! " / "? "
  const sentences = text.split(/(?<=\.)\s+(?=[A-ZÅÄÖÜÉ])|(?<=[!?])\s+/);
  return sentences.map((s) => s.trim()).filter((s) => s.length > 5);
}

function parseInstagramCaption(caption: string, sourceUrl: string): RecipeData {
  let lines = cleanInstagramCaption(caption);
  lines = stripUsername(lines);

  const { servings, filtered } = extractServings(lines);
  lines = filtered;

  // ── Strategy 1: Header-based parsing ──
  const ingredientHeaderIdx = lines.findIndex((l) =>
    /^ingredients?\b/i.test(l),
  );
  const instructionHeaderIdx = lines.findIndex((l) =>
    /^(instructions?|directions?|method|steps|how to make|preparation|gör så här|instruktioner|tillagning)\b/i.test(l),
  );

  if (ingredientHeaderIdx >= 0 || instructionHeaderIdx >= 0) {
    const headerStart = Math.min(
      ...[ingredientHeaderIdx, instructionHeaderIdx].filter((i) => i >= 0),
    );

    const title = headerStart > 0 ? lines[0] : "Instagram Recipe";
    const descriptionLines: string[] = [];
    for (let i = 1; i < headerStart; i++) {
      if (!lines[i].startsWith("#")) descriptionLines.push(lines[i]);
    }

    const ingredients: string[] = [];
    const instructions: string[] = [];

    if (ingredientHeaderIdx >= 0) {
      const end = instructionHeaderIdx > ingredientHeaderIdx ? instructionHeaderIdx : lines.length;
      for (let i = ingredientHeaderIdx + 1; i < end; i++) {
        const line = lines[i].replace(/^[-•·◦▪⁃*]\s*/, "").trim();
        if (line && !line.startsWith("#")) ingredients.push(line);
      }
    }

    if (instructionHeaderIdx >= 0) {
      const end = ingredientHeaderIdx > instructionHeaderIdx ? ingredientHeaderIdx : lines.length;
      for (let i = instructionHeaderIdx + 1; i < end; i++) {
        const line = lines[i]
          .replace(/^(?:step\s*)?\d+[.):\s-]+/i, "")
          .replace(/^[-•·◦▪⁃*]\s*/, "")
          .trim();
        if (!line || line.startsWith("#")) continue;
        instructions.push(line);
      }
    }

    return {
      title: title.replace(/^[✨⭐🌟\s*]+|[✨⭐🌟\s*]+$/g, "").trim() || title,
      description: descriptionLines.join("\n") || undefined,
      ingredients,
      instructions,
      images: [],
      servings,
      sourceUrl,
    };
  }

  // ── Strategy 2: Score-based classification ──
  const scores = lines.map((l) => ({
    line: l,
    ing: scoreIngredient(l),
    ins: scoreInstruction(l),
  }));

  // Find the longest cluster of consecutive ingredient-scored lines (score > 0.3)
  let bestClusterStart = -1;
  let bestClusterEnd = -1;
  let clusterStart = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i].ing >= 0.3 && scores[i].ing > scores[i].ins) {
      if (clusterStart < 0) clusterStart = i;
    } else {
      if (clusterStart >= 0 && i - clusterStart > bestClusterEnd - bestClusterStart) {
        bestClusterStart = clusterStart;
        bestClusterEnd = i;
      }
      clusterStart = -1;
    }
  }
  // Check final cluster
  if (clusterStart >= 0 && scores.length - clusterStart > bestClusterEnd - bestClusterStart) {
    bestClusterStart = clusterStart;
    bestClusterEnd = scores.length;
  }

  // Need at least 2 ingredient lines to count as a cluster
  if (bestClusterStart >= 0 && bestClusterEnd - bestClusterStart < 2) {
    bestClusterStart = -1;
    bestClusterEnd = -1;
  }

  // Extend cluster forward: include short non-instruction lines until a clear instruction line
  if (bestClusterStart >= 0 && bestClusterEnd < scores.length) {
    let extended = bestClusterEnd;
    for (let i = bestClusterEnd; i < scores.length; i++) {
      const s = scores[i];
      // Stop at clear instruction lines (long + cooking verbs)
      if (s.ins >= 0.4) break;
      // Include short lines that aren't clearly instructions
      if (s.line.length < 60 && s.ins < 0.2) {
        extended = i + 1;
      } else {
        break;
      }
    }
    bestClusterEnd = extended;
  }

  // Extract title — prefer a decorated or all-caps-ish line early on
  let titleIdx = 0;
  for (let i = 0; i < Math.min(scores.length, 5); i++) {
    const l = scores[i].line;
    if (/[✨⭐🌟]/.test(l) || (l.length > 3 && l === l.toUpperCase())) {
      titleIdx = i;
      break;
    }
  }
  const title = (scores[titleIdx]?.line ?? "Instagram Recipe")
    .replace(/^[✨⭐🌟\s*]+|[✨⭐🌟\s*]+$/g, "")
    .trim() || "Instagram Recipe";

  const descriptionLines: string[] = [];
  const ingredients: string[] = [];
  const instructions: string[] = [];

  if (bestClusterStart >= 0) {
    // Description: lines between title and ingredient cluster
    const descEnd = bestClusterStart;
    for (let i = titleIdx + 1; i < descEnd; i++) {
      const l = scores[i].line;
      if (!l.startsWith("#") && l.length > 2) {
        descriptionLines.push(l);
      }
    }

    // Ingredients: the cluster
    for (let i = bestClusterStart; i < bestClusterEnd; i++) {
      const line = scores[i].line.replace(/^[-•·◦▪⁃*]\s*/, "").trim();
      if (line) ingredients.push(line);
    }

    // Instructions: lines after the ingredient cluster
    for (let i = bestClusterEnd; i < scores.length; i++) {
      const l = scores[i].line;
      if (l.startsWith("#")) continue;
      // Long lines → split into sentences
      if (l.length > 100) {
        instructions.push(...splitIntoSentences(l));
      } else {
        const cleaned = l.replace(/^(?:step\s*)?\d+[.):\s-]+/i, "").trim();
        if (cleaned) instructions.push(cleaned);
      }
    }
  } else {
    // No ingredient cluster found — fall back to bullet/number detection + scoring
    for (let i = titleIdx + 1; i < scores.length; i++) {
      const l = scores[i].line;
      if (l.startsWith("#")) continue;
      if (/^[-•·◦▪⁃*]\s/.test(l)) {
        ingredients.push(l.replace(/^[-•·◦▪⁃*]\s*/, "").trim());
      } else if (/^\d+[.)]\s/.test(l)) {
        instructions.push(l.replace(/^\d+[.)]\s*/, "").trim());
      } else if (scores[i].ins > 0.3 && l.length > 60) {
        instructions.push(...splitIntoSentences(l));
      } else {
        descriptionLines.push(l);
      }
    }
  }

  return {
    title,
    description: descriptionLines.join("\n") || undefined,
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
