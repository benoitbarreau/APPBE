import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useAppStore, useEditorState } from "../store";
import { getEffectivePorts } from "../ports";
import { isDecorativePort, type Port } from "../types";

// Catégories qui utilisent le rendu « bloc rond »
const SPEAKER_CATEGORIES = new Set(["Enceintes", "Caisson de basse"]);

// Les 4 positions orthogonales dans l'ordre N→E→S→W
const SPEAKER_POSITIONS: Position[] = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
];

type ProductNodeType = Node<{ nodeId: string }, "product">;

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return true;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

export function ProductNode({ data, selected }: NodeProps<ProductNodeType>) {
  const { nodeId } = data;
  const node = useAppStore((s) => s.nodes.find((n) => n.id === nodeId));
  const product = useAppStore((s) =>
    s.products.find((p) => p.id === node?.productId),
  );
  const cables = useAppStore((s) => s.cables);
  const zones = useAppStore((s) => s.zones);
  const setNodeZone = useAppStore((s) => s.setNodeZone);
  const updateNode = useAppStore((s) => s.updateNode);
  const readOnly = useEditorState((s) => s.readOnly);
  if (!node || !product) return null;

  // ── Bloc rond pour Enceintes / Caissons de basse ──────────────────────
  if (SPEAKER_CATEGORIES.has(product.category)) {
    return (
      <SpeakerNode
        node={node}
        product={product}
        selected={!!selected}
        readOnly={readOnly}
        zones={zones}
        setNodeZone={setNodeZone}
      />
    );
  }

  const { inputs, outputs, middle } = getEffectivePorts(product, node);
  const zone = zones.find((z) => z.id === node.zoneId);
  const headerBg = zone?.color;
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

  const portUsedOn = (portId: string, side: "midL" | "midR"): boolean =>
    cables.some(
      (c) =>
        (c.fromNodeId === node.id &&
          c.fromPortId === portId &&
          c.fromPortSide === side) ||
        (c.toNodeId === node.id &&
          c.toPortId === portId &&
          c.toPortSide === side),
    );

  return (
    <div
      className={"product-node" + (selected ? " selected" : "")}
      title={`${product.manufacturer} ${product.reference} — ${product.category}`}
    >
      <div
        className="product-node-header"
        style={
          headerBg
            ? { background: headerBg, color: headerColor }
            : undefined
        }
      >
        <div className="product-node-name-row">
          <div className="product-node-name">{product.manufacturer}</div>
          <input
            className={`product-node-label nodrag${node.labelIsAuto ? " is-auto" : ""}`}
            value={node.label ?? ""}
            placeholder="Label"
            readOnly={readOnly}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              !readOnly && updateNode(node.id, { label: e.target.value })
            }
            title={
              node.labelIsAuto
                ? "Label auto-généré — modifiez pour le rendre permanent"
                : "Label du produit (ex. numéro d'inventaire)"
            }
          />
        </div>
        <div
          className="product-node-ref"
          style={headerSubColor ? { color: headerSubColor } : undefined}
        >
          {product.reference}
        </div>
        <div className="product-node-cat-row">
          <div
            className="product-node-cat"
            style={headerSubColor ? { color: headerSubColor } : undefined}
          >
            {product.category}
          </div>
          {zone && (
            <div className="product-node-zone-name" title={`Zone : ${zone.label}`}>
              {zone.label}
            </div>
          )}
        </div>
        {selected && (
          <select
            className="product-node-zone-select"
            value={node.zoneId ?? ""}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              setNodeZone(node.id, e.target.value || undefined)
            }
            title="Zone du produit"
          >
            <option value="">— Aucune zone —</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        )}
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
                  <PortRow port={row.input} side="in" nodeId={node.id} />
                )}
              </div>
              <div className="port-half port-half-out">
                {row.output && (
                  <PortRow port={row.output} side="out" nodeId={node.id} />
                )}
              </div>
            </div>
          ),
        )}
      </div>
      {middle.length > 0 && (
        <div className="middle-rows">
          {middle.map((p) => (
            <MiddlePortRow
              key={p.id}
              port={p}
              nodeId={node.id}
              leftUsed={portUsedOn(p.id, "midL")}
              rightUsed={portUsedOn(p.id, "midR")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bloc rond Enceinte / Caisson de basse ─────────────────────────────────

function SpeakerNode({
  node,
  product,
  selected,
  readOnly,
  zones,
  setNodeZone,
}: {
  node: ReturnType<typeof useAppStore.getState>["nodes"][number];
  product: ReturnType<typeof useAppStore.getState>["products"][number];
  selected: boolean;
  readOnly: boolean;
  zones: ReturnType<typeof useAppStore.getState>["zones"];
  setNodeZone: (nodeId: string, zoneId: string | undefined) => void;
}) {
  const signals = useAppStore((s) => s.signals);
  const { inputs, outputs, middle } = getEffectivePorts(product, node);

  // Aplatit tous les ports non-décoratifs dans l'ordre inputs → outputs → middle
  const allPorts: { port: Port; side: "in" | "out" | "midL" }[] = [
    ...inputs.filter((p) => !isDecorativePort(p)).map((p) => ({ port: p, side: "in" as const })),
    ...outputs.filter((p) => !isDecorativePort(p)).map((p) => ({ port: p, side: "out" as const })),
    ...middle.filter((p) => !isDecorativePort(p)).map((p) => ({ port: p, side: "midL" as const })),
  ];

  const zone = zones.find((z) => z.id === node.zoneId);

  // Styles inline du cercle pour la couleur de zone
  const ringColor = zone?.color;

  return (
    <div
      className={[
        "speaker-node",
        selected ? "selected" : "",
      ].filter(Boolean).join(" ")}
      style={ringColor ? { "--speaker-zone-color": ringColor } as React.CSSProperties : undefined}
      title={`${product.manufacturer} ${product.reference} — ${product.category}`}
    >
      {/* ── Handles aux 4 positions orthogonales ── */}
      {(() => {
        // Si exactement 1 port → le dupliquer aux 4 coins avec suffixe positionnel
        const SUFFIXES = ["_n", "_e", "_s", "_w"] as const;
        const items =
          allPorts.length === 1
            ? SPEAKER_POSITIONS.map((pos, idx) => {
                const { port } = allPorts[0];
                return {
                  pos,
                  color: signals[port.signal]?.color ?? "#888",
                  handleId: `in:${port.id}${SUFFIXES[idx]}`,
                  label: port.label,
                  signal: port.signal,
                };
              })
            : allPorts.map(({ port, side }, idx) => ({
                pos: SPEAKER_POSITIONS[idx % 4],
                color: signals[port.signal]?.color ?? "#888",
                handleId: `${side}:${port.id}`,
                label: port.label,
                signal: port.signal,
              }));

        // Centrage précis sur le bord du cercle selon la position
        const posStyleFor = (pos: Position): React.CSSProperties =>
          pos === Position.Top    ? { left: "50%", top: 0,     transform: "translate(-50%, -50%)" } :
          pos === Position.Right  ? { left: "100%", top: "50%", transform: "translate(-50%, -50%)" } :
          pos === Position.Bottom ? { left: "50%", top: "100%", transform: "translate(-50%, -50%)" } :
                                    { left: 0,     top: "50%", transform: "translate(-50%, -50%)" };

        return items.map(({ pos, color, handleId, signal }) => (
          <Handle
            key={handleId}
            id={handleId}
            type="source"
            position={pos}
            style={{
              background: color,
              width: 7,
              height: 7,
              border: "none",
              borderRadius: "50%",
              ...posStyleFor(pos),
            }}
            isConnectable
            data-nodeid={node.id}
            title={signal}
          />
        ));
      })()}

      {/* ── Contenu centré dans le disque ── */}
      <div className="speaker-node-inner">
        <div className="speaker-node-brand">{product.manufacturer}</div>
        <div className="speaker-node-ref">{product.reference}</div>
      </div>

      {/* ── Sélecteur de zone (affiché en survol/sélection) ── */}
      {selected && !readOnly && (
        <select
          className="speaker-node-zone-select"
          value={node.zoneId ?? ""}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setNodeZone(node.id, e.target.value || undefined)}
          title="Zone du produit"
        >
          <option value="">— Aucune zone —</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function PortRow({
  port,
  side,
  nodeId,
}: {
  port: Port;
  side: "in" | "out";
  nodeId: string;
}) {
  // Espace : ligne vide sans pastille de connexion et sans label (juste de la
  // hauteur pour aérer la liste). Aucun Handle React Flow → non connectable.
  if (port.kind === "spacer") {
    return <div className={"port-row port-spacer " + side} />;
  }
  const color = useAppStore((s) => s.signals[port.signal]?.color) ?? "#888";
  const handleId = `${side}:${port.id}`;
  const handleStyle: React.CSSProperties = {
    background: color,
    width: 7,
    height: 7,
    border: "none",
    top: "50%",
    ...(side === "in"
      ? { left: 0, transform: "translate(-50%, -50%)" }
      : { left: "auto", right: 0, transform: "translate(50%, -50%)" }),
  };
  return (
    <div className={"port-row " + side} title={`${port.signal} — ${port.label}`}>
      <Handle
        id={handleId}
        type="source"
        position={side === "in" ? Position.Left : Position.Right}
        style={handleStyle}
        isConnectable
        data-nodeid={nodeId}
      />
      <span className="port-label">{port.label}</span>
    </div>
  );
}

function MiddlePortRow({
  port,
  nodeId,
  leftUsed,
  rightUsed,
}: {
  port: Port;
  nodeId: string;
  leftUsed: boolean;
  rightUsed: boolean;
}) {
  // Espace milieu : ligne vide sans label ni Handle, mais conserve la hauteur.
  if (port.kind === "spacer") {
    return <div className="middle-row port-spacer" />;
  }
  // Séparateur milieu : ligne en pointillés gris foncé pleine largeur,
  // pas de label ni de Handle.
  if (port.kind === "separator") {
    return (
      <div className="middle-row port-separator-row">
        <hr className="port-separator" />
      </div>
    );
  }
  const color = useAppStore((s) => s.signals[port.signal]?.color) ?? "#888";
  const dim = "#cfd4dc";
  // If left is used, right is blocked. If right is used, left is blocked.
  const leftConnectable = !rightUsed;
  const rightConnectable = !leftUsed;
  const baseStyle: React.CSSProperties = {
    width: 7,
    height: 7,
    border: "none",
    top: "50%",
  };
  const leftStyle: React.CSSProperties = {
    ...baseStyle,
    background: leftConnectable ? color : dim,
    left: 0,
    transform: "translate(-50%, -50%)",
    cursor: leftConnectable ? "crosshair" : "not-allowed",
  };
  const rightStyle: React.CSSProperties = {
    ...baseStyle,
    background: rightConnectable ? color : dim,
    left: "auto",
    right: 0,
    transform: "translate(50%, -50%)",
    cursor: rightConnectable ? "crosshair" : "not-allowed",
  };
  return (
    <div
      className="middle-row"
      title={`${port.signal} — ${port.label}`}
    >
      <Handle
        id={`midL:${port.id}`}
        type="source"
        position={Position.Left}
        style={leftStyle}
        isConnectable={leftConnectable}
        data-nodeid={nodeId}
      />
      <span className="port-label">{port.label}</span>
      <Handle
        id={`midR:${port.id}`}
        type="source"
        position={Position.Right}
        style={rightStyle}
        isConnectable={rightConnectable}
        data-nodeid={nodeId}
      />
    </div>
  );
}

/**
 * Construit la liste de lignes à afficher dans le corps du bloc produit en
 * appariant chaque entrée avec une sortie. Les séparateurs présents dans l'une
 * ou l'autre des listes consomment une ligne complète (pleine largeur) et
 * décalent vers le bas tout ce qui suit dans LES DEUX colonnes — cela permet
 * d'obtenir une ligne de coupure visuelle nette.
 *
 * Quand un séparateur est présent au MÊME index dans les deux listes, il
 * n'est dessiné qu'une seule fois.
 */
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
