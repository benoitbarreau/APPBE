import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useAppStore, useEditorState } from "../store";
import { getEffectivePorts } from "../ports";
import { type Port } from "../types";

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
            className="product-node-label"
            value={node.label ?? ""}
            placeholder="Label"
            readOnly={readOnly}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              !readOnly && updateNode(node.id, { label: e.target.value })
            }
            title="Label du produit (ex. numéro d'inventaire)"
          />
        </div>
        <div
          className="product-node-ref"
          style={headerSubColor ? { color: headerSubColor } : undefined}
        >
          {product.reference}
        </div>
        <div
          className="product-node-cat"
          style={headerSubColor ? { color: headerSubColor } : undefined}
        >
          {product.category}
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
        <div className="port-col">
          {inputs.map((p) => (
            <PortRow key={p.id} port={p} side="in" nodeId={node.id} />
          ))}
        </div>
        <div className="port-col port-col-out">
          {outputs.map((p) => (
            <PortRow key={p.id} port={p} side="out" nodeId={node.id} />
          ))}
        </div>
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

function PortRow({
  port,
  side,
  nodeId,
}: {
  port: Port;
  side: "in" | "out";
  nodeId: string;
}) {
  const color = useAppStore((s) => s.signals[port.signal]?.color) ?? "#888";
  const handleId = `${side}:${port.id}`;
  const handleStyle: React.CSSProperties = {
    background: color,
    width: 9,
    height: 9,
    border: "2px solid #fff",
    boxShadow: `0 0 0 1px ${color}`,
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
  const color = useAppStore((s) => s.signals[port.signal]?.color) ?? "#888";
  const dim = "#cfd4dc";
  // If left is used, right is blocked. If right is used, left is blocked.
  const leftConnectable = !rightUsed;
  const rightConnectable = !leftUsed;
  const baseStyle: React.CSSProperties = {
    width: 9,
    height: 9,
    border: "2px solid #fff",
    top: "50%",
  };
  const leftStyle: React.CSSProperties = {
    ...baseStyle,
    background: leftConnectable ? color : dim,
    boxShadow: `0 0 0 1px ${leftConnectable ? color : dim}`,
    left: 0,
    transform: "translate(-50%, -50%)",
    cursor: leftConnectable ? "crosshair" : "not-allowed",
  };
  const rightStyle: React.CSSProperties = {
    ...baseStyle,
    background: rightConnectable ? color : dim,
    boxShadow: `0 0 0 1px ${rightConnectable ? color : dim}`,
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
