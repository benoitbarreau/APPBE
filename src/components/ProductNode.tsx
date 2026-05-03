import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useAppStore } from "../store";
import { SIGNAL_COLORS, type Port } from "../types";

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
  const color = SIGNAL_COLORS[port.signal] ?? "#888";
  const handleId = `${side}:${port.id}`;
  return (
    <div className={"port-row " + side} title={`${port.signal} — ${port.label}`}>
      {side === "in" && (
        <Handle
          id={handleId}
          type="target"
          position={Position.Left}
          style={{ background: color, width: 10, height: 10 }}
          isConnectable
          data-nodeid={nodeId}
        />
      )}
      <span className="port-dot" style={{ background: color }} />
      <span className="port-label">{port.label}</span>
      <span className="port-signal" style={{ color }}>
        {port.signal}
      </span>
      {side === "out" && (
        <Handle
          id={handleId}
          type="source"
          position={Position.Right}
          style={{ background: color, width: 10, height: 10 }}
          isConnectable
          data-nodeid={nodeId}
        />
      )}
    </div>
  );
}
