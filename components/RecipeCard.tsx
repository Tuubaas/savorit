"use client";

import { useEffect, useRef, useState } from "react";
import type { RecipeData } from "../app/actions";

export function RecipeCard({ recipe }: { recipe: RecipeData }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener("release", () => {
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
    }
  }

  async function releaseWakeLock() {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);
  }

  async function toggleWakeLock() {
    if (wakeLockActive) {
      await releaseWakeLock();
    } else {
      await acquireWakeLock();
    }
  }

  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState === "visible" && wakeLockActive) {
        await acquireWakeLock();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [wakeLockActive]);

  function toggleIngredient(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const image = recipe.images[0];
  const hasMeta = recipe.prepTime || recipe.cookTime || recipe.servings;

  return (
    <div className="recipe-card w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={recipe.title}
          className="w-full object-cover max-h-72"
        />
      )}

      <div className="flex flex-col gap-6 p-5">
        {/* Title + description + PDF button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2 min-w-0">
            <h2 className="text-2xl font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
              {recipe.title}
            </h2>
            {recipe.description && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-pre-line">
                {recipe.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            title="Save as PDF"
            className="print:hidden shrink-0 flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M4 1h8v4H4V1Z" fill="currentColor" opacity=".4" />
              <path d="M2 6h12a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1v-2H3v2H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" fill="currentColor" />
              <path d="M4 10h8v5H4v-5Z" fill="currentColor" opacity=".4" />
            </svg>
            Save as PDF
          </button>
        </div>

        {/* Meta: prep / cook / servings */}
        {hasMeta && (
          <div className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            {recipe.prepTime && (
              <span>
                <span className="mr-1">⏱</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {recipe.prepTime}
                </span>{" "}
                prep
              </span>
            )}
            {recipe.cookTime && (
              <span>
                <span className="mr-1">🍳</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {recipe.cookTime}
                </span>{" "}
                cook
              </span>
            )}
            {recipe.servings && (
              <span>
                <span className="mr-1">👥</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {recipe.servings}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Ingredients
            </h3>
            <ul className="flex flex-col gap-2">
              {recipe.ingredients.map((ingredient, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => toggleIngredient(i)}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-700"
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked.has(i)
                          ? "border-zinc-400 bg-zinc-400 dark:border-zinc-500 dark:bg-zinc-500"
                          : "border-zinc-300 dark:border-zinc-600"
                      }`}
                    >
                      {checked.has(i) && (
                        <svg
                          className="h-2.5 w-2.5 text-white"
                          viewBox="0 0 10 10"
                          fill="none"
                        >
                          <path
                            d="M1.5 5L4 7.5L8.5 2.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className={
                        checked.has(i)
                          ? "line-through text-zinc-400 dark:text-zinc-500"
                          : "text-zinc-700 dark:text-zinc-300"
                      }
                    >
                      {ingredient}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions.length > 0 && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Instructions
            </h3>
            <ol className="flex flex-col gap-4">
              {recipe.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {i + 1}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Empty state for heuristic fallback with no content */}
        {recipe.ingredients.length === 0 && recipe.instructions.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
            Could not extract structured recipe data from this page.
          </p>
        )}
           {recipe.sourceUrl && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Source: </span>
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-700 dark:text-zinc-300 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100 break-all"
            >
              {recipe.sourceUrl}
            </a>
          </div>
        )}


        {/* Wake lock toggle */}
        <div className="print:hidden border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <button
            type="button"
            onClick={toggleWakeLock}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              wakeLockActive
                ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                : "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            <span>{wakeLockActive ? "🔆" : "💤"}</span>
            <span>{wakeLockActive ? "Screen stays on" : "Keep screen on"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
