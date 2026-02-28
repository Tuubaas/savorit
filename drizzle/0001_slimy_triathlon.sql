ALTER TABLE "recipes" DROP CONSTRAINT "recipes_source_url_unique";--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "user_id" text NOT NULL;