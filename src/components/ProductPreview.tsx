import { useAppStore } from "../store";
import type { Port, Product } from "../types";

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return true;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

export function ProductPreview({
  product,
  zoneColor,
}: {
  product: Product;
  zoneColor?: string;
}) {
  const signals = useAppStore((s) => s.signals);
  const inputs = product.inputs;
  const outputs = product.outputs;
  const middle = product.middle ?? [];

  const headerBg = zoneColor;
  const headerColor = headerBg
    ? isLightHex(headerBg)
      ? "#1c1f24"
      : "#ffffff"
    : undefined;
  const headerSubColor = headerBg
    ? isLightHex(headerBg)
      ? "rgba(0,0,0,0.55)"
      : "rgba(255,255,255,0.8)"
    : undefined;

  const dotStyle = (color: string, side: "in" | "out") => ({
    background: color,
    width: 9,
    height: 9,
    border: "2px solid #fff",
    boxShadow: `0 0 0 1px ${color}`,
    borderRadius: "50%",
    position: "absolute" as const,
    top: "50%",
    ...(side === "in"
      ? { left: 0, transform: "translate(-50%, -50%)" }
      : { right: 0, transform: "translate(50%, -50%)" }),
  });

  return (
    <div className="product-node product-preview">
      <div
        className="product-node-header"
        style={
          headerBg ? { background: headerBg, color: headerColor } : undefined
        }
      >
        <div className="product-node-name">
          {product.manufacturer || <span className="muted">Marque</span>}
        </div>
        <div
          className="product-node-ref"
          style={headerSubColor ? { color: headerSubColor } : undefined}
        >
          {product.reference || <span className="muted">Référence</span>}
        </div>
        <div
          className="product-node-cat"
          style={headerSubColor ? { color: headerSubColor } : undefined}
        >
          {product.category || <span className="muted">Catégorie</span>}
        </div>
      </div>
      <div className="product-node-body">
        {buildPortRows(inputs, outputs).map((row, idx) =>
          row.kind === "separator" ? (
            <div key={`sep-${idx}`} className="port-pair-separator">
              <hr className="port-separator" />
            </div>
          ) : (
            <div key={row.key} className="port-pair-row">
              <div className="port-half port-half-in">
                {row.input && (
                  <PreviewRow port={row.input} side="in" dotStyle={dotStyle} signals={signals} />
                )}
              </div>
              <div className="port-half port-half-out">
                {row.output && (
                  <PreviewRow port={row.output} side="out" dotStyle={dotStyle} signals={signals} />
                )}
              </div>
            </div>
          ),
        )}
      </div>
      {middle.length > 0 && (
        <div className="middle-rows">
          {middle.map((p) => {
            if (p.kind === "spacer") {
              return <div key={p.id} className="middle-row port-spacer" />;
            }
            if (p.kind === "separator") {
              return (
                <div key={p.id} className="middle-row port-separator-row">
                  <hr className="port-separator" />
                </div>
              );
            }
            const color = signals[p.signal]?.color ?? "#888";
            return (
              <div key={p.id} className="middle-row">
                <span style={dotStyle(color, "in")} />
                <span className="port-label">{p.label}</span>
                <span style={dotStyle(color, "out")} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  port,
  side,
  dotStyle,
  signals,
}: {
  port: Port;
  side: "in" | "out";
  dotStyle: (color: string, side: "in" | "out") => React.CSSProperties;
  signals: Record<string, { color: string }>;
}) {
  // Espace : ligne vide sans pastille ni label
  if (port.kind === "spacer") {
    return <div className={"port-row port-spacer " + side} />;
  }
  const color = signals[port.signal]?.color ?? "#888";
  return (
    <div className={"port-row " + side}>
      <span style={dotStyle(color, side)} />
      <span className="port-label">{port.label}</span>
    </div>
  );
}

/** Apparie chaque entrée avec une sortie ; les séparateurs consomment une
 *  ligne pleine largeur. Cf. ProductNode pour la spec détaillée. */
type PortPairRow =
  | { kind: "pair"; key: string; input?: Port; output?: Port }
  | { kind: "separator" };

function buildPortRows(inputs: Port[], outputs: Port[]): PortPairRow[] {
  const rows: PortPairRow[] = [];
  let i = 0;
  let j = 0;
  while (i < inputs.length || j < outputs.length) {
    const inSep = inputs[i]?.kind === "separator";
    const outSep = outputs[j]?.kind === "separator";
    if (inSep && outSep) {
      rows.push({ kind: "separator" });
      i++;
      j++;
    } else if (inSep) {
      rows.push({ kind: "separator" });
      i++;
    } else if (outSep) {
      rows.push({ kind: "separator" });
      j++;
    } else {
      const input  = i < inputs.length  ? inputs[i]  : undefined;
      const output = j < outputs.length ? outputs[j] : undefined;
      rows.push({
        kind: "pair",
        key: `${input?.id ?? "_"}:${output?.id ?? "_"}:${i}:${j}`,
        input,
        output,
      });
      if (i < inputs.length)  i++;
      if (j < outputs.length) j++;
    }
  }
  return rows;
}
