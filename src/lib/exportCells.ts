/** Neutralise une cellule CSV qui serait lue comme une formule par Excel ou
 *  LibreOffice (début par = + - @, tabulation ou retour chariot) : une apostrophe
 *  la fait lire comme du texte. */
export function safeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Type d'image de la page composée : un export JPEG doit être un vrai JPEG
 *  (il était composé en PNG puis seulement renommé en .jpeg). */
export function composedImageType(format?: string): "image/jpeg" | "image/png" {
  return format === "jpeg" ? "image/jpeg" : "image/png";
}

/** Style d'une cellule XLS (tableau HTML) lue comme du texte par Excel : pas de
 *  formule, zéros de tête et identifiants (« 1-2 ») conservés. Apostrophes et non
 *  guillemets : la valeur est insérée dans un attribut style="…". */
export const XLS_TEXT_CELL = "mso-number-format:'\\@';";
