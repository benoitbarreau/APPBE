import type { Rack, RackItem, RackSize } from "../types";

/** Position et taille d'un équipement dans une baie (uStart compté depuis le bas, 1 = U du bas). */
type Placement = Pick<RackItem, "uStart" | "heightU" | "widthCols" | "colStart">;

const overlaps = (a: Placement, b: Placement): boolean =>
  a.uStart < b.uStart + b.heightU && b.uStart < a.uStart + a.heightU
  && a.colStart < b.colStart + b.widthCols && b.colStart < a.colStart + a.widthCols;

/** Raison pour laquelle l'équipement ne peut pas être placé ainsi, ou null s'il le peut.
 *  Règle unique pour toutes les voies : clic, glisser-déposer, panneau Propriétés,
 *  synchronisation et store. `ignoreId` : l'équipement lui-même quand on le déplace. */
export function placementProblem(
  rack: Rack,
  candidate: Placement,
  ignoreId?: string,
  productRackSize?: RackSize,
): string | null {
  const { uStart, heightU, widthCols, colStart } = candidate;
  if (!Number.isInteger(heightU) || heightU < 1) return "La hauteur doit être d'au moins 1 U.";
  if (!Number.isInteger(uStart) || uStart < 1) return "La position doit être d'au moins U1.";
  if (heightU > rack.heightU) return `L'équipement (${heightU} U) dépasse la hauteur de la baie (${rack.heightU} U).`;
  if (uStart + heightU - 1 > rack.heightU) return `L'équipement dépasse le haut de la baie (${rack.heightU} U).`;
  if (colStart < 0 || colStart + widthCols > 4) return "L'équipement dépasse la largeur de la baie.";
  if (productRackSize === "19" && rack.widthInch === 10) return "Un équipement 19\" ne rentre pas dans une baie 10\".";
  const other = rack.items.find((it) => it.id !== ignoreId && overlaps(candidate, it));
  if (other) return `Emplacement déjà occupé par « ${other.label || other.reference || "un équipement"} ».`;
  return null;
}

/** Première place libre, du bas vers le haut puis de gauche à droite, ou null. */
export function findFreeSlot(
  rack: Rack,
  heightU: number,
  widthCols: RackItem["widthCols"],
): { uStart: number; colStart: RackItem["colStart"] } | null {
  for (let uStart = 1; uStart + heightU - 1 <= rack.heightU; uStart++) {
    for (let col = 0; col + widthCols <= 4; col++) {
      const colStart = col as RackItem["colStart"];
      if (!placementProblem(rack, { uStart, heightU, widthCols, colStart })) return { uStart, colStart };
    }
  }
  return null;
}

/** Raison pour laquelle la baie ne peut pas prendre cette hauteur, ou null. */
export function rackResizeProblem(rack: Rack, newHeightU: number): string | null {
  if (!Number.isInteger(newHeightU) || newHeightU < 1 || newHeightU > 100) return "La hauteur doit être comprise entre 1 et 100 U.";
  const outside = rack.items.filter((it) => it.uStart + it.heightU - 1 > newHeightU);
  if (outside.length > 0) {
    const names = outside.map((it) => it.label || it.reference || "équipement").join(", ");
    return `${outside.length} équipement(s) dépasseraient la nouvelle hauteur : ${names}. Déplacez-les d'abord.`;
  }
  return null;
}

/** Numéro affiché pour le U physique `uFromBottom` (1 = U du bas), selon la
 *  numérotation de la baie. La position stockée est toujours comptée depuis le bas. */
export function uLabel(rack: Pick<Rack, "heightU" | "numberingFromBottom">, uFromBottom: number): number {
  return rack.numberingFromBottom ? uFromBottom : rack.heightU - uFromBottom + 1;
}

/** Position stockée (depuis le bas) d'un numéro saisi dans la numérotation affichée. */
export function uStartFromLabel(rack: Pick<Rack, "heightU" | "numberingFromBottom">, label: number): number {
  return rack.numberingFromBottom ? label : rack.heightU - label + 1;
}

/** Colonne de départ recalée pour qu'une largeur donnée reste dans la baie. */
export function fitColumn(colStart: number, widthCols: RackItem["widthCols"]): RackItem["colStart"] {
  return Math.min(colStart, 4 - widthCols) as RackItem["colStart"];
}

/** Format rack (19" ou 10") du produit d'un équipement, s'il est connu. */
export function productRackSize(products: { id: string; rackSize?: RackSize }[], productId?: string): RackSize | undefined {
  return productId ? products.find((p) => p.id === productId)?.rackSize : undefined;
}
