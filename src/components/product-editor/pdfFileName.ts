// ── Utilitaire : extrait le nom de fichier depuis une URL de stockage ─────────
export const pdfFileName = (url: string): string => {
  try {
    const decoded = decodeURIComponent(url);
    const name = decoded.split("/").pop()?.split("?")[0] ?? "";
    // Retirer le segment productId/ devant le nom si présent
    return name.includes("/") ? name.split("/").pop()! : name || "Fiche PDF";
  } catch {
    return "Fiche PDF";
  }
};
