/** Message compréhensible pour un échec d'enregistrement du projet, selon sa
 *  cause : droit retiré, projet supprimé, réseau, ou message brut sinon. */
export function describeSaveError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  const message = e instanceof Error ? e.message : String(e);
  if (code === "42501") {
    return "Vous n'avez plus le droit de modifier ce projet (partage retiré, passé en lecture, ou compte non approuvé). Vos modifications ne sont pas enregistrées : exportez le projet en JSON pour les garder.";
  }
  if (code === "P0002" || /Projet introuvable/i.test(message)) {
    return "Ce projet est introuvable : il a peut-être été supprimé. Vos modifications ne sont pas enregistrées : exportez le projet en JSON pour les garder.";
  }
  if (e instanceof TypeError || /Failed to fetch|NetworkError|network/i.test(message)) {
    return "Pas de connexion au serveur : l'enregistrement reprendra automatiquement dès le retour du réseau.";
  }
  return `Échec de l'enregistrement : ${message}`;
}
