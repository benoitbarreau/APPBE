import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useAppStore } from "../store";
import { type Port } from "../types";

type ProductNodeType = Node<{ nodeId: string }, "product">;

export function ProductNode({ data, selected }: NodeProps<ProductNodeType>) {
  const { nodeId } = data;
  const node = useAppStore((s) => s.nodes.find((n) => n.id === nodeId));
  const product = useAppStore((s) =>
    s.products.find((p) => p.id === node?.productId),
  );
  if (!node || !product) return null;

  const inputs = product.inputs;
  const outputs = product.outputs;
  const rows = Math.max(inputs.length, outputs.length, 1);

  return (
    <div
      className={"product-node" + (selected ? " selected" : "")}
      style={{ minHeight: 60 + rows * 22 }}
    >
      <div className="product-node-header">
        <div className="product-node-name">{node.name}</div>
        <div className="product-node-ref">
          {product.manufacturer} · {product.reference}
        </div>
        <div className="product-node-cat">{product.category}</div>
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
