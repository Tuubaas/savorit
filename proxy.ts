import { auth } from "@/lib/auth/server";

export default auth.middleware({
	loginUrl: "/auth/sign-in",
});

export const config = {
	matcher: [
		// Protect everything except auth routes, API auth, static files, and Next internals
		"/((?!auth|api/auth|_next/static|_next/image|favicon\\.ico|recipe-images).*)",
	],
};
