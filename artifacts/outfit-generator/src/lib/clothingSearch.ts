/**
 * clothingSearch.ts — weighted multi-field search over clothing items and lookbook groups.
 *
 * Field weights:
 *   name / brand       10 / 8  (highest — most intentional labels)
 *   notes              4
 *   color / category   5 / 4
 *   size / season / occasion  3 each
 *   price / date       2 each
 *   visionLabels       2  (auto-extracted colours & objects)
 *   visionText         1  (OCR text — least reliable)
 *
 * A group matches if its name, notes, or any contained item matches.
 * Results are deduplicated and sorted by score descending.
 */

import type { ClothingItem, SavedOutfit } from "@/lib/db";

export interface SearchResults {
  items:  ClothingItem[];
  groups: SavedOutfit[];
}

function tokenize(s: string): string[] {
  return s.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function scoreText(
  value: string | null | undefined,
  tokens: string[],
  weight: number,
): number {
  if (!value) return 0;
  const v = value.toLowerCase();
  return tokens.reduce((acc, t) => acc + (v.includes(t) ? weight : 0), 0);
}

function scoreArray(
  values: string[] | null | undefined,
  tokens: string[],
  weight: number,
): number {
  if (!values?.length) return 0;
  const v = values.join(" ").toLowerCase();
  return tokens.reduce((acc, t) => acc + (v.includes(t) ? weight : 0), 0);
}

function scoreItem(item: ClothingItem, tokens: string[]): number {
  return (
    scoreText(item.name,          tokens, 10) +
    scoreText(item.brand,         tokens,  8) +
    scoreText(item.notes,         tokens,  4) +
    scoreText(item.color,         tokens,  5) +
    scoreText(item.category,      tokens,  4) +
    scoreText(item.size,          tokens,  3) +
    scoreText(item.season,        tokens,  3) +
    scoreText(item.occasion,      tokens,  3) +
    scoreText(item.purchasePrice, tokens,  2) +
    scoreText(item.purchaseDate,  tokens,  2) +
    scoreArray(item.visionLabels, tokens,  2) +
    scoreArray(item.visionText,   tokens,  1)
  );
}

export function searchClothing(
  query: string,
  items:   ClothingItem[],
  outfits: SavedOutfit[],
): SearchResults {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { items: [], groups: [] };

  // ── Score items ─────────────────────────────────────────────────────────────
  const scoredItems = items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const matchedItemIds = new Set(scoredItems.map(({ item }) => item.id));

  // ── Score groups ────────────────────────────────────────────────────────────
  const scoredGroups = outfits
    .map((outfit) => {
      const nameScore = scoreText(outfit.name,  tokens, 10)
                      + scoreText(outfit.notes, tokens,  4);
      const itemScore = outfit.items.some((i) => matchedItemIds.has(i.id)) ? 1 : 0;
      return { outfit, score: nameScore + itemScore };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    items:  scoredItems .map(({ item   }) => item),
    groups: scoredGroups.map(({ outfit }) => outfit),
  };
}
