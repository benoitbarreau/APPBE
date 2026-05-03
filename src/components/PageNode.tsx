import { PAGE_BOUNDS } from "../page";

export function PageNode() {
  return (
    <div
      className="page-boundary"
      style={{ width: PAGE_BOUNDS.width, height: PAGE_BOUNDS.height }}
    >
      <div className="page-boundary-label">A3 — Format d'export</div>
    </div>
  );
}
