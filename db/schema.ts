import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const recipes = pgTable("recipes", {
	id: uuid().defaultRandom().primaryKey(),
	title: text().notNull(),
	description: text(),
	sourceUrl: text("source_url").notNull(),
	imageUrl: text("image_url"),
	servings: text(),
	rawCaption: text("raw_caption").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
	tags: text().array().default([]).notNull(),
});

export const ingredients = pgTable("ingredients", {
	id: uuid().defaultRandom().primaryKey(),
	recipeId: uuid("recipe_id")
		.notNull()
		.references(() => recipes.id, { onDelete: "cascade" }),
	name: text().notNull(),
	quantity: text(),
	orderIndex: integer("order_index").notNull(),
});

export const instructions = pgTable("instructions", {
	id: uuid().defaultRandom().primaryKey(),
	recipeId: uuid("recipe_id")
		.notNull()
		.references(() => recipes.id, { onDelete: "cascade" }),
	stepNumber: integer("step_number").notNull(),
	content: text().notNull(),
});

export const recipesRelations = relations(recipes, ({ many }) => ({
	ingredients: many(ingredients),
	instructions: many(instructions),
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
	recipe: one(recipes, {
		fields: [ingredients.recipeId],
		references: [recipes.id],
	}),
}));

export const instructionsRelations = relations(instructions, ({ one }) => ({
	recipe: one(recipes, {
		fields: [instructions.recipeId],
		references: [recipes.id],
	}),
}));
