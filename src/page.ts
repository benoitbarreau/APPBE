// A3 landscape (420mm x 297mm) at 4 px/mm gives a comfortable on-screen
// frame that 8-9 product blocks can fit in. The export pipeline uses
// these same bounds, scaled up to a real A3 print resolution.
export const PAGE_NODE_ID = "__page__";
export const PAGE_BOUNDS = {
  x: 0,
  y: 0,
  width: 1680,
  height: 1188,
};
