"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type RecipeListItem = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  tags: string[];
  createdBy?: string | null;
  createdAt: Date | string;
};

function recipeMatchesSearch(recipe: RecipeListItem, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (recipe.tags ?? []).some((tag) => tag.toLowerCase().includes(q));
}

function recipeHasAllTags(recipe: RecipeListItem, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const recipeTags = new Set((recipe.tags ?? []).map((t) => t.toLowerCase()));
  return tags.every((t) => recipeTags.has(t.toLowerCase()));
}

export function RecipeListWithFilter({ recipes }: { recipes: RecipeListItem[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) {
      for (const t of r.tags ?? []) {
        if (t.trim()) set.add(t);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  const suggestedTags = useMemo(() => {
    if (!searchQuery.trim()) return uniqueTags.slice(0, 8);
    const q = searchQuery.trim().toLowerCase();
    return uniqueTags
      .filter((tag) => tag.toLowerCase().includes(q))
      .slice(0, 8);
  }, [uniqueTags, searchQuery]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter(
      (r) =>
        recipeMatchesSearch(r, searchQuery) &&
        recipeHasAllTags(r, [...activeFilters]),
    );
  }, [recipes, searchQuery, activeFilters]);

  function toggleFilter(tag: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      const key = [...prev].find((t) => t.toLowerCase() === tag.toLowerCase());
      if (key) {
        next.delete(key);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function addFilter(tag: string) {
    setActiveFilters((prev) => new Set([...prev, tag]));
    setSearchQuery("");
  }

  function removeFilter(tag: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      const key = [...prev].find((t) => t.toLowerCase() === tag.toLowerCase());
      if (key) next.delete(key);
      return next;
    });
  }

  const hasActiveFilters = activeFilters.size > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by tag..."
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
        {/* Tag suggestions when typing */}
        {searchQuery.trim() && suggestedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addFilter(tag)}
                className="rounded-full bg-zinc-200 dark:bg-zinc-700 px-2.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active filters */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Filtering by:
          </span>
          {[...activeFilters].map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-2.5 py-0.5 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeFilter(tag)}
                aria-label={`Remove filter ${tag}`}
                className="rounded p-0.5 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M2 2l8 8M10 2L2 10"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Recipe count when filtered */}
      {hasActiveFilters && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Showing {filteredRecipes.length} of {recipes.length} recipes
        </p>
      )}

      {/* Recipe list */}
      {filteredRecipes.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
          {recipes.length === 0
            ? "No recipes saved yet."
            : "No recipes match the selected tags."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredRecipes.map((recipe) => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="flex gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              {recipe.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={recipe.imageUrl}
                  alt={recipe.title}
                  className="h-20 w-20 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {recipe.title}
                </h2>
                {recipe.description && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {recipe.description}
                  </p>
                )}
                {recipe.tags && recipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {recipe.tags.map((tag, i) => {
                      const isActive = [...activeFilters].some(
                        (f) => f.toLowerCase() === tag.toLowerCase(),
                      );
                      return (
                        <button
                          key={`${tag}-${i}`}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFilter(tag);
                          }}
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs transition-colors cursor-pointer ${
                            isActive
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-auto">
                  {recipe.createdBy && `${recipe.createdBy} · `}{new Date(recipe.createdAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
