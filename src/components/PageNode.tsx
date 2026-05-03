import { PAGE_BOUNDS } from "../page";

export function PageNode({
  data,
}: {
  data: { label?: string };
}) {
  return (
    <div
      className="page-boundary"
      style={{ width: PAGE_BOUNDS.width, height: PAGE_BOUNDS.height }}
    >
      <div className="page-boundary-label">{data?.label ?? "A3"}</div>
    </div>
  );
}
