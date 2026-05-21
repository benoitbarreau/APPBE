import type { PlacedProduct, Port, PortPlacement, Product } from "./types";

export function defaultPlacement(
  product: Product,
  node: PlacedProduct,
  portId: string,
): PortPlacement {
  if (product.outputs.some((p) => p.id === portId)) return "right";
  if ((product.middle ?? []).some((p) => p.id === portId)) return "middle";
  if (product.inputs.some((p) => p.id === portId)) return "left";
  // Extra port (instance-only): infer from its direction
  const extra = (node.extraPorts ?? []).find((p) => p.id === portId);
  if (extra) {
    if (extra.direction === "out") return "right";
    if (extra.direction === "bi") return "middle";
    return "left";
  }
  return "left";
}

export function getEffectivePlacement(
  product: Product,
  node: PlacedProduct,
  portId: string,
): PortPlacement {
  return node.portOverrides?.[portId] ?? defaultPlacement(product, node, portId);
}

export function isExtraPort(node: PlacedProduct, portId: string): boolean {
  return (node.extraPorts ?? []).some((p) => p.id === portId);
}

export function getEffectivePort(
  _product: Product,
  node: PlacedProduct,
  port: Port,
): Port {
  // Extra ports keep their own label/signal
  if (isExtraPort(node, port.id)) return port;
  // Catalog port: apply label and/or signal override if any
  const labelOverride = node.portLabelOverrides?.[port.id];
  const signalOverride = node.portSignalOverrides?.[port.id];
  if (labelOverride !== undefined || signalOverride !== undefined) {
    return {
      ...port,
      ...(labelOverride !== undefined ? { label: labelOverride } : {}),
      ...(signalOverride !== undefined ? { signal: signalOverride } : {}),
    };
  }
  return port;
}

function sortByOrder(ports: Port[], order: string[] | undefined): Port[] {
  if (!order || order.length === 0) return ports;
  const idx = new Map<string, number>();
  order.forEach((id, i) => idx.set(id, i));
  return [...ports].sort((a, b) => {
    const ai = idx.get(a.id);
    const bi = idx.get(b.id);
    if (ai === undefined && bi === undefined) return 0;
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    return ai - bi;
  });
}

export function getEffectivePorts(
  product: Product,
  node: PlacedProduct,
): { inputs: Port[]; outputs: Port[]; middle: Port[] } {
  const inputs: Port[] = [];
  const outputs: Port[] = [];
  const middle: Port[] = [];
  const hidden = new Set(node.hiddenPorts ?? []);
  const all: Port[] = [
    ...product.inputs,
    ...product.outputs,
    ...(product.middle ?? []),
    ...(node.extraPorts ?? []),
  ].filter((p) => !hidden.has(p.id));
  for (const p of all) {
    const placement = getEffectivePlacement(product, node, p.id);
    const eff = getEffectivePort(product, node, p);
    if (placement === "left") inputs.push(eff);
    else if (placement === "right") outputs.push(eff);
    else middle.push(eff);
  }
  const order = node.portOrder;
  return {
    inputs: sortByOrder(inputs, order),
    outputs: sortByOrder(outputs, order),
    middle: sortByOrder(middle, order),
  };
}
