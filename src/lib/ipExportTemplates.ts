/** Modèles prédéfinis d'export du Tableau IP (colonnes fixes uniquement).
 *  Aucun modèle n'inclut les mots de passe : leur export demande de cocher la
 *  colonne à la main, et n'est jamais permis en lecture seule. */
export const IP_EXPORT_TEMPLATES: { id: string; label: string; columns: string[] }[] = [
  {
    id: "complet",
    label: "Modèle complet",
    columns: ["product", "label", "deviceId", "ip", "ipDante", "ipDanteSec", "login", "serialNumber", "mac", "macDante"],
  },
  {
    id: "reseau",
    label: "Modèle réseau",
    columns: ["product", "label", "deviceId", "ip", "ipDante", "ipDanteSec", "mac", "macDante"],
  },
  {
    id: "client",
    label: "Modèle client",
    columns: ["product", "label", "ip", "login"],
  },
  {
    id: "maintenance",
    label: "Modèle maintenance",
    columns: ["product", "label", "deviceId", "ip", "login", "serialNumber", "mac", "macDante"],
  },
];

/** Colonnes réellement exportées : la colonne « mot de passe » est retirée
 *  quand l'export des mots de passe n'est pas autorisé. */
export function exportableColumns(columnIds: string[], opts: { passwords: boolean }): string[] {
  return opts.passwords ? columnIds : columnIds.filter((id) => id !== "password");
}
