import { chromium } from "playwright";

export interface InstagramPostData {
	caption: string;
	imageUrl: string | null;
}

function toEmbedUrl(url: string): string | null {
	try {
		const match = new URL(url).pathname.match(
			/\/(p|reel|reels)\/([^/]+)/,
		);
		if (!match) return null;
		return `https://www.instagram.com/${match[1]}/${match[2]}/embed/captioned/`;
	} catch {
		return null;
	}
}

export function isInstagramUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname;
		return hostname === "instagram.com" || hostname.endsWith(".instagram.com");
	} catch {
		return false;
	}
}

export async function extractInstagramPost(
	url: string,
): Promise<InstagramPostData> {
	const embedUrl = toEmbedUrl(url);
	if (!embedUrl) {
		throw new Error("Invalid Instagram URL. Expected a post or reel link.");
	}

	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(embedUrl, { waitUntil: "networkidle", timeout: 15_000 });

		// Wait for the caption element to render
		await page
			.waitForSelector(".Caption, .CaptionContent", { timeout: 10_000 })
			.catch(() => {
				// Caption selector might not exist — continue and try alternatives
			});

		const caption = await page.evaluate(() => {
			// Strategy 1: Instagram embed caption classes
			const captionEl =
				document.querySelector(".CaptionContent") ??
				document.querySelector(".Caption");
			if (captionEl?.textContent?.trim()) {
				return captionEl.textContent.trim();
			}

			// Strategy 2: Blockquote content (oEmbed-style embeds)
			const blockquote = document.querySelector(
				"blockquote.instagram-media",
			);
			if (blockquote?.textContent?.trim()) {
				return blockquote.textContent.trim();
			}

			// Strategy 3: Any substantial text on the page
			const body = document.body.textContent?.trim() ?? "";
			return body.length > 20 ? body : "";
		});

		const imageUrl = await page.evaluate(() => {
			const img = document.querySelector(
				"img.EmbeddedMediaImage, img[src*='instagram']",
			);
			return img?.getAttribute("src") ?? null;
		});

		if (!caption) {
			throw new Error("Could not extract caption from Instagram post.");
		}

		return { caption, imageUrl };
	} finally {
		await browser.close();
	}
}
