import { auth } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const authMiddleware = auth.middleware({ loginUrl: "/auth/sign-in" });

export default async function proxy(request: NextRequest) {
	// Server actions use a special header — let them through
	// to avoid breaking the RSC response protocol
	if (request.headers.get("Next-Action")) {
		return NextResponse.next();
	}
	return authMiddleware(request);
}

export const config = {
	matcher: [
		/*
		 * Protect all routes except:
		 * - /auth/* (sign-in, sign-up, etc.)
		 * - /api/auth/* (auth API handler)
		 * - /_next/static, /_next/image, favicon.ico, public assets
		 */
		"/((?!auth|api/auth|api/instagram|_next/static|_next/image|favicon\\.ico|recipe-images).*)",
	],
};
