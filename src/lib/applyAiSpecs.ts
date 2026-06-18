import type { Port, Product } from '../types'
import type { ProductAiSpecs } from './aiCompleteApi'

/** Quels groupes de caractéristiques proposées par l'IA appliquer.
 *  Permet à l'utilisateur de cocher/décocher chaque champ avant application. */
export interface AiSelection {
  inputs: boolean
  outputs: boolean
  rack: boolean // rackHeightU + rackSize (affiché « Format rack »)
  powerOperatingW: boolean
  powerStandbyW: boolean
  thermalBtuH: boolean
  dimensions: boolean // widthCm + depthCm + heightCm
  weightKg: boolean
}

/** Sélection « tout appliquer » — comportement par défaut (ex. complétion en lot). */
export const ALL_AI_SELECTED: AiSelection = {
  inputs: true,
  outputs: true,
  rack: true,
  powerOperatingW: true,
  powerStandbyW: true,
  thermalBtuH: true,
  dimensions: true,
  weightKg: true,
}

/**
 * Fusionne les caractéristiques proposées par l'IA dans une fiche produit.
 * - `sel` indique quels groupes appliquer (par défaut : tous).
 * - Un groupe non sélectionné laisse la valeur existante intacte.
 * - Les connecteurs (entrées/sorties) REMPLACENT ceux existants si sélectionnés et trouvés.
 * Utilisé par l'éditeur (sélection fine) ET la complétion en lot (tout).
 */
export function mergeAiSpecsIntoProduct(
  product: Product,
  specs: ProductAiSpecs,
  sel: AiSelection = ALL_AI_SELECTED,
): Product {
  const toPorts = (arr: ProductAiSpecs['inputs'], side: 'inputs' | 'outputs'): Port[] =>
    (arr ?? []).map((p, i) => ({
      id: `${side}-ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      label: p.label || `${side === 'inputs' ? 'IN' : 'OUT'} ${i + 1}`,
      signal: p.signal || 'HDMI',
      direction:
        p.direction === 'in' || p.direction === 'out' || p.direction === 'bi'
          ? p.direction
          : side === 'inputs'
            ? 'in'
            : 'out',
    }))

  return {
    ...product,
    inputs: sel.inputs && specs.inputs?.length ? toPorts(specs.inputs, 'inputs') : product.inputs,
    outputs: sel.outputs && specs.outputs?.length ? toPorts(specs.outputs, 'outputs') : product.outputs,
    powerOperatingW: sel.powerOperatingW ? (specs.powerOperatingW ?? product.powerOperatingW) : product.powerOperatingW,
    powerStandbyW: sel.powerStandbyW ? (specs.powerStandbyW ?? product.powerStandbyW) : product.powerStandbyW,
    thermalBtuH: sel.thermalBtuH ? (specs.thermalBtuH ?? product.thermalBtuH) : product.thermalBtuH,
    rackHeightU: sel.rack ? (specs.rackHeightU ?? product.rackHeightU) : product.rackHeightU,
    rackSize: sel.rack ? (specs.rackSize ?? product.rackSize) : product.rackSize,
    widthCm: sel.dimensions ? (specs.widthCm ?? product.widthCm) : product.widthCm,
    depthCm: sel.dimensions ? (specs.depthCm ?? product.depthCm) : product.depthCm,
    heightCm: sel.dimensions ? (specs.heightCm ?? product.heightCm) : product.heightCm,
    weightKg: sel.weightKg ? (specs.weightKg ?? product.weightKg) : product.weightKg,
  }
}
