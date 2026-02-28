import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const example = pgTable("example", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
