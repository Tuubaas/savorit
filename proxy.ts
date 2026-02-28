import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
	matcher: [
		/*
		 * Protect all routes except:
		 * - /auth/* (sign-in, sign-up, etc.)
		 * - /api/auth/* (auth API handler)
		 * - /_next/static, /_next/image, favicon.ico, public assets
		 */
		"/((?!auth|api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
