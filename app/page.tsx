"use client";

import { useActionState } from "react";
import { parseUrlAction } from "./actions";
import type { ParseResult } from "./actions";

const initialState: ParseResult | null = null;

export default function Home() {
  const [state, formAction, isPending] = useActionState(parseUrlAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center gap-8 py-16 px-6 sm:px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col gap-6 w-full">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Parse text from URL
          </h1>
          <form action={formAction} className="flex flex-col gap-4 sm:flex-row sm:items-end w-full">
            <label className="flex flex-1 flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                URL
              </span>
              <input
                type="url"
                name="url"
                placeholder="https://example.com"
                required
                disabled={isPending}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="flex h-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isPending ? "Parsing…" : "Parse"}
            </button>
          </form>
        </div>

        {state && (
          <div className="w-full flex flex-col gap-2">
            {state.success ? (
              <>
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                  Extracted text
                </h2>
                <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
                  {state.text}
                </pre>
              </>
            ) : (
              <p className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                {state.error}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
