// A3 landscape (420mm x 297mm) at 4 px/mm gives a comfortable on-screen
// frame. The export pipeline scales these bounds up to real A3 print resolution.
//
// HEIGHT calculation — must match the usable diagram area in export.ts :
//   A3 raster   : RASTER_W=2480 × RASTER_H=1754  (1x, ×PIX=2 → 300dpi)
//   Bottom strip: BOTTOM_H=160  (cartouche + mention légale ≈ 26mm)
//   Diagram area: DIAGRAM_H = 1754 − 160 = 1594 px raster
//   Canvas scale: 1188 / 1754 = 0.6775 px-canvas / px-raster
//   Usable height (canvas): round(1594 × 0.6775) = 1080 px
//
// ⚠️  If BOTTOM_H changes in export.ts, recalculate:
//       round((RASTER_H − BOTTOM_H) × 1188 / RASTER_H)
export const PAGE_NODE_ID = "__page__";
export const PAGE_BOUNDS = {
  x: 0,
  y: 0,
  width: 1680,
  height: 1080, // zone utile (hors cartouche + mention légale)
};
