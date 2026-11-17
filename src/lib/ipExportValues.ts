import type { IPNetworkInfo, IPTableRow } from "../types";

/** Champs du cartouche réseau, avec les intitulés affichés dans le Tableau IP. */
export const NET_LABELS: { key: keyof IPNetworkInfo; label: string }[] = [
  { key: "plageIp", label: "PLAGE IP" },
  // La clé historique « dhcp » contient le masque (intitulé MASQUE à l'écran).
  { key: "dhcp", label: "MASQUE" },
  { key: "dns", label: "DNS" },
  { key: "passerelle", label: "PASSERELLE" },
  { key: "ntp", label: "NTP" },
];

/** Valeur exportée d'une cellule (PDF, XLS, impression) : colonnes personnalisées
 *  comprises, et label d'une ligne orpheline marqué « (orpheline) ». */
export function exportCellValue(row: Partial<IPTableRow>, key: string): string {
  if (key.startsWith("custom_")) return row.customFields?.[key] ?? "";
  const value = String((row as Record<string, unknown>)[key] ?? "");
  if (key === "label" && row.orphan) return `${value} (orpheline)`.trim();
  return value;
}
