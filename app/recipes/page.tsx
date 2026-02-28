export const dynamic = "force-dynamic";

import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "../../db";
import { recipes } from "../../db/schema";
import { RecipeListWithFilter } from "./RecipeListWithFilter";

export default async function RecipesPage() {
  const allRecipes = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      description: recipes.description,
      imageUrl: recipes.imageUrl,
      tags: recipes.tags,
      createdAt: recipes.createdAt,
    })
    .from(recipes)
    .orderBy(desc(recipes.createdAt));

  const recipeList = allRecipes.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    imageUrl: r.imageUrl,
    tags: r.tags ?? [],
    createdAt: r.createdAt,
  }));

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
          <RecipeListWithFilter recipes={recipeList} />
        )}
      </main>
    </div>
  );
}
