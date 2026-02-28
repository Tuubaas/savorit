import { NextResponse } from "next/server";
import {
	extractInstagramPost,
	isInstagramUrl,
} from "../../../lib/instagram";

export async function POST(request: Request) {
	const body = (await request.json()) as { url?: string };
	const url = typeof body.url === "string" ? body.url.trim() : "";

	if (!url) {
		return NextResponse.json({ error: "Missing url." }, { status: 400 });
	}

	if (!isInstagramUrl(url)) {
		return NextResponse.json(
			{ error: "Not an Instagram URL." },
			{ status: 400 },
		);
	}

	try {
		const result = await extractInstagramPost(url);
		return NextResponse.json(result);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Failed to extract post.";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
