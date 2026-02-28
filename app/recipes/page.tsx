export const dynamic = "force-dynamic";

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { recipes } from "../../db/schema";

export default async function RecipesPage() {
  const allRecipes = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      description: recipes.description,
      imageUrl: recipes.imageUrl,
      createdAt: recipes.createdAt,
    })
    .from(recipes)
    .where(eq(recipes.userId, "anonymous"))
    .orderBy(desc(recipes.createdAt));

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-2xl mx-auto flex-col gap-8 py-12 px-5 bg-white dark:bg-black">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            My Recipes
          </h1>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
          >
            Add Recipe
          </Link>
        </div>

        {allRecipes.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
            No recipes saved yet.{" "}
            <Link href="/" className="underline hover:text-zinc-600">
              Add one
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {allRecipes.map((recipe) => (
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
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-auto">
                    {recipe.createdAt.toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
