import type { PlacedProduct, Port, PortPlacement, Product } from "./types";

export function defaultPlacement(
  product: Product,
  portId: string,
): PortPlacement {
  if (product.outputs.some((p) => p.id === portId)) return "right";
  if ((product.middle ?? []).some((p) => p.id === portId)) return "middle";
  return "left";
}

export function getEffectivePlacement(
  product: Product,
  node: PlacedProduct,
  portId: string,
): PortPlacement {
  return node.portOverrides?.[portId] ?? defaultPlacement(product, portId);
}

export function getEffectivePorts(
  product: Product,
  node: PlacedProduct,
): { inputs: Port[]; outputs: Port[]; middle: Port[] } {
  const inputs: Port[] = [];
  const outputs: Port[] = [];
  const middle: Port[] = [];
  const all: Port[] = [
    ...product.inputs,
    ...product.outputs,
    ...(product.middle ?? []),
  ];
  for (const p of all) {
    const placement = getEffectivePlacement(product, node, p.id);
    if (placement === "left") inputs.push(p);
    else if (placement === "right") outputs.push(p);
    else middle.push(p);
  }
  return { inputs, outputs, middle };
}
