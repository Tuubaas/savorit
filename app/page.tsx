"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { ParseResult } from "./actions";
import { parseUrlAction } from "./actions";
import { RecipeCard } from "../components/RecipeCard";

const initialState: ParseResult | null = null;
const OPENAI_KEY_STORAGE = "savorit_openai_key";

export default function Home() {
  const [state, formAction, isPending] = useActionState(
    parseUrlAction,
    initialState,
  );
  const [openaiKey, setOpenaiKey] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(OPENAI_KEY_STORAGE);
    if (stored) setOpenaiKey(stored);
  }, []);

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-2xl mx-auto flex-col gap-8 py-12 px-5 bg-white dark:bg-black">
        <div className="print:hidden flex flex-col gap-6 w-full">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Savorit
            </h1>
            <Link
              href="/recipes"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              My Recipes
            </Link>
          </div>

          <form
            action={formAction}
            className="flex flex-col gap-4 sm:flex-row sm:items-end w-full"
          >
            <input type="hidden" name="openaiKey" value={openaiKey} />
            <label className="flex flex-1 flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Recipe URL
              </span>
              <input
                type="url"
                name="url"
                placeholder="https://allrecipes.com/recipe/…"
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
              {isPending ? "Fetching…" : "Get Recipe"}
            </button>
          </form>
        </div>

        {state && (
          <div className="w-full">
            {state.success ? (
              <RecipeCard recipe={state.recipe} recipeId={state.id} />
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
