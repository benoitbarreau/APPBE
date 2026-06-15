import type { Port, Product } from '../types'
import type { ProductAiSpecs } from './aiCompleteApi'

/**
 * Fusionne les caractéristiques proposées par l'IA dans une fiche produit.
 * - Les connecteurs (entrées/sorties) REMPLACENT ceux existants si l'IA en a trouvé.
 * - Les autres champs ne sont écrasés que si l'IA a fourni une valeur (sinon on garde l'existant).
 * Utilisé par l'éditeur (application unitaire) ET la complétion en lot.
 */
export function mergeAiSpecsIntoProduct(product: Product, specs: ProductAiSpecs): Product {
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
    inputs: specs.inputs?.length ? toPorts(specs.inputs, 'inputs') : product.inputs,
    outputs: specs.outputs?.length ? toPorts(specs.outputs, 'outputs') : product.outputs,
    powerOperatingW: specs.powerOperatingW ?? product.powerOperatingW,
    powerStandbyW: specs.powerStandbyW ?? product.powerStandbyW,
    thermalBtuH: specs.thermalBtuH ?? product.thermalBtuH,
    rackHeightU: specs.rackHeightU ?? product.rackHeightU,
    rackSize: specs.rackSize ?? product.rackSize,
    widthCm: specs.widthCm ?? product.widthCm,
    depthCm: specs.depthCm ?? product.depthCm,
    heightCm: specs.heightCm ?? product.heightCm,
    weightKg: specs.weightKg ?? product.weightKg,
  }
}
