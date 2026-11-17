import type { CartoucheData } from "../export";
import type { ProjectMeta, Tab } from "../types";

/** Cartouche des exports (synoptiques et baies), construit à un seul endroit pour
 *  reproduire le cartouche affiché : campus saisi avant le nom du projet, lot saisi
 *  pour l'onglet avant son nom, bureau d'étude compris, date jamais vide. */
export function buildCartouche(
  meta: Pick<ProjectMeta, "client" | "lieu" | "campus" | "bureauEtude" | "authorName" | "version" | "date">,
  projectName: string,
  tab?: Pick<Tab, "name" | "trade">,
): CartoucheData {
  return {
    client: meta.client,
    lieu: meta.lieu,
    campus: meta.campus?.trim() || projectName?.trim() || "Sans titre",
    tabName: tab?.trade?.trim() || tab?.name || "",
    bureauEtude: meta.bureauEtude?.trim() || "",
    date:
      meta.date ||
      new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    authorName: meta.authorName,
    version: meta.version || "V1.0",
  };
}
