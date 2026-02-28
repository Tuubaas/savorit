"use client";

import { authClient } from "@/lib/auth/client";
import {
	NeonAuthUIProvider,
	UserButton,
} from "@neondatabase/auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	return (
		<NeonAuthUIProvider
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			authClient={authClient as any}
			redirectTo="/"
			emailOTP
			navigate={router.push}
			replace={router.replace}
			onSessionChange={() => router.refresh()}
			Link={Link}
		>
			{children}
		</NeonAuthUIProvider>
	);
}

export { UserButton };
