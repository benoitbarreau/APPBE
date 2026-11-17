import type { Rack, Tab } from "../types";
import { isIPTableTab } from "../types";
import { uLabel } from "./rackLayout";

/** Ligne des exports CSV et XLS d'une baie. */
export interface TRow { posU: string; hU: string; mfr: string; ref: string; label: string; ip: string; swPort: string; vlan: string; serial: string }

/** IP et n° de série du Tableau IP, par nœud de synoptique (première ligne trouvée). */
export function ipLinksByNode(tabs: Tab[]): Map<string, { ip: string; serial: string }> {
  const links = new Map<string, { ip: string; serial: string }>();
  for (const tab of tabs) {
    if (!isIPTableTab(tab)) continue;
    for (const row of tab.rows ?? []) {
      for (const nodeId of row.productInstanceIds) {
        if (!links.has(nodeId)) links.set(nodeId, { ip: row.ip ?? "", serial: row.serialNumber ?? "" });
      }
    }
  }
  return links;
}

/** Lignes d'export d'une ou plusieurs baies, du haut vers le bas. Un équipement venu
 *  d'un synoptique reprend l'IP et le n° de série du Tableau IP, comme sa fenêtre de
 *  propriétés ; les autres gardent leurs annotations. */
export function buildBayRows(racks: Rack[], links: Map<string, { ip: string; serial: string }> = new Map()): TRow[] {
  const multi = racks.length > 1;
  const rows: TRow[] = [];
  for (const rack of racks) {
    const sorted = [...rack.items].sort((a, b) => b.uStart - a.uStart);
    for (const item of sorted) {
      const link = item.sourceType === "synoptic" && item.nodeId ? links.get(item.nodeId) : undefined;
      rows.push({
        // Numéro affiché à l'écran (selon la numérotation de la baie), pas la position brute.
        posU:   multi ? `${rack.name} U${uLabel(rack, item.uStart)}` : `U${uLabel(rack, item.uStart)}`,
        hU:     `${item.heightU}U`,
        mfr:    item.manufacturer ?? "",
        ref:    item.reference ?? "",
        label:  item.label ?? "",
        ip:     link ? link.ip : item.annotations?.ip ?? "",
        swPort: item.annotations?.switchPort ?? "",
        vlan:   item.annotations?.vlan ?? "",
        serial: link ? link.serial : item.annotations?.serial ?? "",
      });
    }
  }
  return rows;
}
