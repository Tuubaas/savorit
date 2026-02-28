import { chromium } from "playwright";

export interface InstagramPostData {
	caption: string;
	imageData: Buffer | null;
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
		const page = await browser.newPage({
			deviceScaleFactor: 3, // High DPI for screenshot fallback
		});

		// Intercept image responses to capture the original full-resolution image.
		let imageData: Buffer | null = null;
		let resolveImage: (() => void) | null = null;
		const imageReady = new Promise<void>((r) => {
			resolveImage = r;
		});

		page.on("response", async (response) => {
			const respUrl = response.url();
			const contentType = response.headers()["content-type"] ?? "";
			if (
				contentType.startsWith("image/") &&
				(respUrl.includes("scontent") || respUrl.includes("cdninstagram"))
			) {
				try {
					const body = await response.body();
					if (!imageData || body.length > imageData.length) {
						imageData = body;
						if (body.length > 10_000 && resolveImage) {
							resolveImage();
							resolveImage = null;
						}
					}
				} catch {
					// Response body may not be available, ignore
				}
			}
		});

		await page.goto(embedUrl, { waitUntil: "networkidle", timeout: 15_000 });

		// Wait for the caption element to render
		await page
			.waitForSelector(".Caption, .CaptionContent", { timeout: 10_000 })
			.catch(() => {});

		// Wait up to 3s for a CDN image (works for posts)
		await Promise.race([
			imageReady,
			new Promise<void>((r) => setTimeout(r, 3_000)),
		]);

		// Fallback 1: extract thumbnail URL from embedded JSON in <script> tags
		if (!imageData || (imageData as Buffer).length < 10_000) {
			const scriptImageUrl = await page.evaluate(() => {
				const scripts = document.querySelectorAll("script");
				for (const s of scripts) {
					const text = s.textContent ?? "";
					// Look for CDN image URLs in script content
					const re = new RegExp(
						'"(https?://[^"]*(?:scontent|cdninstagram)[^"]*\\.(?:jpg|jpeg|png|webp)[^"]*)"',
						"i",
					);
					const match = text.match(re);
					if (match) return match[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
				}
				return null;
			});

			if (scriptImageUrl) {
				const fetched = await page.evaluate(async (url: string) => {
					try {
						const resp = await fetch(url);
						if (!resp.ok) return null;
						const buf = await resp.arrayBuffer();
						const bytes = new Uint8Array(buf);
						let binary = "";
						for (let i = 0; i < bytes.length; i++) {
							binary += String.fromCharCode(bytes[i]);
						}
						return btoa(binary);
					} catch {
						return null;
					}
				}, scriptImageUrl);

				if (fetched) {
					const buf = Buffer.from(fetched, "base64");
					if (buf.length > ((imageData as Buffer | null)?.length ?? 0)) {
						imageData = buf;
					}
				}
			}
		}

		// Fallback 2: high-DPI screenshot of the media element
		if (!imageData || (imageData as Buffer).length < 10_000) {
			const mediaEl = await page.$(
				".EmbeddedMediaImage, .EmbeddedMedia video, .EmbeddedMedia img, .EmbeddedMedia",
			);
			if (mediaEl) {
				imageData = await mediaEl.screenshot({ type: "png" });
			}
		}

		const caption = await page.evaluate(() => {
			// Use innerText instead of textContent to preserve line breaks
			// from <br> tags and block elements
			const captionEl =
				document.querySelector(".CaptionContent") ??
				document.querySelector(".Caption");
			if (captionEl instanceof HTMLElement && captionEl.innerText.trim()) {
				return captionEl.innerText.trim();
			}

			const blockquote = document.querySelector(
				"blockquote.instagram-media",
			);
			if (blockquote instanceof HTMLElement && blockquote.innerText.trim()) {
				return blockquote.innerText.trim();
			}

			const body = document.body.innerText?.trim() ?? "";
			return body.length > 20 ? body : "";
		});

		if (!caption) {
			throw new Error("Could not extract caption from Instagram post.");
		}

		return { caption, imageData };
	} finally {
		await browser.close();
	}
}
