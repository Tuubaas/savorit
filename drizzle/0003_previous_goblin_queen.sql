CREATE TABLE "user_recipes" (
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_recipes_user_id_recipe_id_pk" PRIMARY KEY("user_id","recipe_id")
);
--> statement-breakpoint
ALTER TABLE "user_recipes" ADD CONSTRAINT "user_recipes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" DROP COLUMN "user_id";