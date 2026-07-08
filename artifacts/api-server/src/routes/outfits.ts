import { Router, type IRouter } from "express";
import { eq, inArray, and } from "drizzle-orm";
import { db, savedOutfitsTable, outfitItemsTable, clothingItemsTable } from "@workspace/db";
import {
  SaveOutfitBody,
  DeleteOutfitParams,
  AddOutfitItemParams,
  AddOutfitItemBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth.js";

const router: IRouter = Router();

router.get("/outfits", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;

  const outfits = await db
    .select()
    .from(savedOutfitsTable)
    .where(eq(savedOutfitsTable.userId, userId))
    .orderBy(savedOutfitsTable.createdAt);

  const outfitItems = await db.select().from(outfitItemsTable);
  const clothingItems = await db
    .select()
    .from(clothingItemsTable)
    .where(eq(clothingItemsTable.userId, userId));

  const result = outfits.map((outfit) => {
    const itemIds = outfitItems
      .filter((oi) => oi.outfitId === outfit.id)
      .map((oi) => oi.clothingItemId);
    const items = clothingItems.filter((ci) => itemIds.includes(ci.id));
    return { ...outfit, itemIds, items };
  });

  res.json(result);
});

router.post("/outfits", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const parsed = SaveOutfitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify the caller owns all referenced clothing items
  if (parsed.data.itemIds.length > 0) {
    const ownedItems = await db
      .select({ id: clothingItemsTable.id })
      .from(clothingItemsTable)
      .where(and(inArray(clothingItemsTable.id, parsed.data.itemIds), eq(clothingItemsTable.userId, userId)));

    if (ownedItems.length !== parsed.data.itemIds.length) {
      res.status(403).json({ error: "One or more clothing items do not belong to you" });
      return;
    }
  }

  const [outfit] = await db
    .insert(savedOutfitsTable)
    .values({ userId, name: parsed.data.name, notes: parsed.data.notes ?? null })
    .returning();

  if (parsed.data.itemIds.length > 0) {
    await db.insert(outfitItemsTable).values(
      parsed.data.itemIds.map((clothingItemId) => ({ outfitId: outfit.id, clothingItemId }))
    );
  }

  const savedItems = parsed.data.itemIds.length > 0
    ? await db.select().from(clothingItemsTable).where(inArray(clothingItemsTable.id, parsed.data.itemIds))
    : [];

  res.status(201).json({ ...outfit, itemIds: parsed.data.itemIds, items: savedItems });
});

router.patch("/outfits/:id/items", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const params = AddOutfitItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = AddOutfitItemBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [outfit] = await db
    .select()
    .from(savedOutfitsTable)
    .where(and(eq(savedOutfitsTable.id, params.data.id), eq(savedOutfitsTable.userId, userId)));
  if (!outfit) { res.status(404).json({ error: "Outfit not found" }); return; }

  const [clothingItem] = await db
    .select()
    .from(clothingItemsTable)
    .where(and(eq(clothingItemsTable.id, body.data.itemId), eq(clothingItemsTable.userId, userId)));
  if (!clothingItem) { res.status(404).json({ error: "Clothing item not found" }); return; }

  const existing = await db.select().from(outfitItemsTable).where(eq(outfitItemsTable.outfitId, params.data.id));
  if (!existing.some((r) => r.clothingItemId === body.data.itemId)) {
    await db.insert(outfitItemsTable).values({ outfitId: params.data.id, clothingItemId: body.data.itemId });
  }

  const allItems = await db.select().from(outfitItemsTable).where(eq(outfitItemsTable.outfitId, params.data.id));
  const itemIds = allItems.map((r) => r.clothingItemId);
  const items = itemIds.length > 0
    ? await db.select().from(clothingItemsTable).where(inArray(clothingItemsTable.id, itemIds))
    : [];

  res.json({ ...outfit, itemIds, items });
});

router.delete("/outfits/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const params = DeleteOutfitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Verify ownership BEFORE removing related rows
  const [outfit] = await db
    .select()
    .from(savedOutfitsTable)
    .where(and(eq(savedOutfitsTable.id, params.data.id), eq(savedOutfitsTable.userId, userId)));

  if (!outfit) { res.status(404).json({ error: "Outfit not found" }); return; }

  await db.delete(outfitItemsTable).where(eq(outfitItemsTable.outfitId, params.data.id));
  await db.delete(savedOutfitsTable).where(eq(savedOutfitsTable.id, params.data.id));

  res.sendStatus(204);
});

export default router;
