import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedOutfitsTable = pgTable("saved_outfits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outfitItemsTable = pgTable("outfit_items", {
  id: serial("id").primaryKey(),
  outfitId: integer("outfit_id").notNull(),
  clothingItemId: integer("clothing_item_id").notNull(),
});

export const insertSavedOutfitSchema = createInsertSchema(savedOutfitsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSavedOutfit = z.infer<typeof insertSavedOutfitSchema>;
export type SavedOutfit = typeof savedOutfitsTable.$inferSelect;
export type OutfitItem = typeof outfitItemsTable.$inferSelect;
