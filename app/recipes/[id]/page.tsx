export const dynamic = "force-dynamic";

import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "../../../db";
import { recipes } from "../../../db/schema";
import type { RecipeData } from "../../actions";
import { RecipeCard } from "../../../components/RecipeCard";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
    with: {
      ingredients: { orderBy: (i, { asc }) => [asc(i.orderIndex)] },
      instructions: { orderBy: (i, { asc }) => [asc(i.stepNumber)] },
    },
  });

  if (!result) notFound();

  const recipe: RecipeData = {
    title: result.title,
    description: result.description ?? undefined,
    servings: result.servings ?? undefined,
    ingredients: result.ingredients.map((i) =>
      i.quantity ? `${i.quantity} ${i.name}` : i.name,
    ),
    instructions: result.instructions.map((i) => i.content),
    images: result.imageUrl ? [result.imageUrl] : [],
    sourceUrl: result.sourceUrl,
    tags: result.tags && result.tags.length > 0 ? result.tags : undefined,
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-2xl mx-auto flex-col gap-6 py-12 px-5 bg-white dark:bg-black">
        <div className="print:hidden flex items-center gap-4">
          <Link
            href="/recipes"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
          >
            &larr; Back to recipes
          </Link>
        </div>
        <RecipeCard recipe={recipe} recipeId={result.id} />
      </main>
    </div>
  );
}
