/**
 * FavoritesPage — shows every clothing item the user has hearted.
 * Accessed via the hanger icon on the Wardrobe rug bar.
 */
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Heart } from "lucide-react";
import { useLocation } from "wouter";
import {
  useListClothing,
  useUpdateClothingItem,
  getListClothingQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  tops:        "Top",
  bottoms:     "Bottom",
  shoes:       "Shoes",
  accessories: "Accessory",
  outerwear:   "Jacket",
  dresses:     "Dress",
};

function FavoriteCard({ item }: { item: ClothingItem }) {
  const updateItem  = useUpdateClothingItem();
  const queryClient = useQueryClient();

  const handleUnheart = () => {
    updateItem.mutate(
      { id: item.id, data: { isFavorite: false } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() }),
      }
    );
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      className="relative border-2 border-black rounded-xl overflow-hidden
                 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
    >
      {/* Photo */}
      <div
        className="w-full aspect-square"
        style={{
          backgroundImage:
            "repeating-conic-gradient(#ede8e0 0% 25%,#f9f4ee 0% 50%)",
          backgroundSize: "10px 10px",
        }}
      >
        {item.imageObjectPath ? (
          <img
            src={getImageUrl(item.imageObjectPath)!}
            alt={item.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">
            {item.category === "shoes" ? "👟" : item.category === "dresses" ? "👗" : "👚"}
          </div>
        )}
      </div>

      {/* Un-heart button */}
      <button
        onClick={handleUnheart}
        disabled={updateItem.isPending}
        className="absolute top-2 right-2 w-7 h-7 rounded-full border-2 border-black
                   bg-red-500 flex items-center justify-center
                   shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                   active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                   transition-all disabled:opacity-50"
        title="Remove from favorites"
      >
        <Heart className="w-3.5 h-3.5 text-white" fill="white" />
      </button>

      {/* Label */}
      <div className="px-2 py-2 border-t-2 border-black bg-white">
        <p className="font-bold text-xs uppercase tracking-wide truncate leading-tight">
          {item.name || CATEGORY_LABELS[item.category ?? ""] || "Item"}
        </p>
        <p className="text-[10px] font-medium text-black/40 uppercase tracking-wider mt-0.5">
          {CATEGORY_LABELS[item.category ?? ""] ?? item.category}
        </p>
      </div>
    </motion.div>
  );
}

export default function FavoritesPage() {
  const [, navigate] = useLocation();

  // Fetch all categories — hook order is fixed, React rules compliant
  const { data: tops        = [] } = useListClothing({ category: "tops"        });
  const { data: bottoms     = [] } = useListClothing({ category: "bottoms"     });
  const { data: shoes       = [] } = useListClothing({ category: "shoes"       });
  const { data: accessories = [] } = useListClothing({ category: "accessories" });
  const { data: outerwear   = [] } = useListClothing({ category: "outerwear"   });
  const { data: dresses     = [] } = useListClothing({ category: "dresses"     });

  const favorites = [
    ...tops, ...bottoms, ...shoes, ...accessories, ...outerwear, ...dresses,
  ].filter((item) => item.isFavorite);

  return (
    <div className="min-h-full flex flex-col bg-[#f9f4ee]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b-2 border-black flex-shrink-0">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-tighter leading-none">
            Favorites
          </h1>
          {favorites.length > 0 && (
            <p className="text-[10px] font-bold text-black/40 uppercase tracking-wider mt-0.5">
              {favorites.length} {favorites.length === 1 ? "item" : "items"}
            </p>
          )}
        </div>
        <Heart
          className="w-5 h-5 text-red-500 ml-auto"
          fill="currentColor"
        />
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-5">
        {favorites.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-64 gap-4 text-center"
          >
            <div className="w-16 h-16 rounded-full border-4 border-black bg-primary
                            flex items-center justify-center
                            shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <Heart className="w-8 h-8" />
            </div>
            <div>
              <p className="font-display font-bold text-xl uppercase tracking-tight">
                No favorites yet
              </p>
              <p className="text-sm text-black/50 font-medium mt-1 leading-snug">
                Tap any item in your wardrobe,<br />then tap the ❤️ to save it here.
              </p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="mt-2 px-5 py-2.5 border-4 border-black rounded-xl
                         font-display font-bold text-sm uppercase tracking-tight
                         bg-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
            >
              Go to Wardrobe
            </button>
          </motion.div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-2 gap-3"
          >
            <AnimatePresence mode="popLayout">
              {favorites.map((item) => (
                <FavoriteCard key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
