"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const OPENAI_KEY_STORAGE = "savorit_openai_key";

export default function IntegrationsPage() {
  const [openaiKey, setOpenaiKey] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(OPENAI_KEY_STORAGE);
    if (stored) setOpenaiKey(stored);
  }, []);

  function handleKeyChange(value: string) {
    setOpenaiKey(value);
    if (value) {
      localStorage.setItem(OPENAI_KEY_STORAGE, value);
    } else {
      localStorage.removeItem(OPENAI_KEY_STORAGE);
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-2xl mx-auto flex-col gap-8 py-12 px-5 bg-white dark:bg-black">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
          >
            &larr; Back
          </Link>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Integrations
        </h1>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 flex flex-col gap-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
            OpenAI
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              API Key
            </span>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono text-sm"
            />
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Stored locally in your browser. Used to clean up and format parsed
              recipes with AI.
            </p>
          </label>
        </div>
      </main>
    </div>
  );
}
