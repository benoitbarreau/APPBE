import { type Dispatch, type SetStateAction } from "react";
import { type Port, type PortDirection, type Product } from "../../types";
import { type PortListKey } from "./types";

const getList = (d: Product, side: PortListKey): Port[] =>
  side === "middle" ? d.middle ?? [] : d[side];

/** Regroupe toutes les opérations d'édition des ports d'un produit.
 *  Reçoit le `setDraft` du formulaire et renvoie les fonctions prêtes à l'emploi.
 *  (Ce sont de simples fabriques de fonctions — aucun hook React interne.) */
export function usePortOperations(setDraft: Dispatch<SetStateAction<Product>>) {
  const setPort = (side: PortListKey, idx: number, patch: Partial<Port>) => {
    setDraft((d) => ({
      ...d,
      [side]: getList(d, side).map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const addPort = (side: PortListKey) => {
    setDraft((d) => {
      const list = getList(d, side);
      const labelPrefix =
        side === "inputs" ? "IN" : side === "outputs" ? "OUT" : "MID";
      const direction: PortDirection =
        side === "inputs" ? "in" : side === "outputs" ? "out" : "bi";
      const newPort: Port = {
        id: `${side}-${list.length + 1}-${Date.now()}`,
        label: `${labelPrefix} ${list.length + 1}`,
        signal: "HDMI",
        direction,
      };
      return { ...d, [side]: [...list, newPort] };
    });
  };

  /** Ajoute un espace (ligne vide sans pastille de connexion). */
  const addSpacer = (side: PortListKey) => {
    setDraft((d) => {
      const list = getList(d, side);
      const direction: PortDirection =
        side === "inputs" ? "in" : side === "outputs" ? "out" : "bi";
      const spacer: Port = {
        id: `spacer-${side}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: "",
        signal: "",
        direction,
        kind: "spacer",
      };
      return { ...d, [side]: [...list, spacer] };
    });
  };

  /** Ajoute un séparateur (ligne pointillée pleine largeur).
   *  Disponible dans les trois sections — quel que soit l'endroit où il est
   *  inséré, il s'affiche sur toute la largeur du bloc produit. */
  const addSeparator = (side: PortListKey) => {
    setDraft((d) => {
      const list = getList(d, side);
      const direction: PortDirection =
        side === "inputs" ? "in" : side === "outputs" ? "out" : "bi";
      const separator: Port = {
        id: `separator-${side}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: "",
        signal: "",
        direction,
        kind: "separator",
      };
      return { ...d, [side]: [...list, separator] };
    });
  };

  const removePort = (side: PortListKey, idx: number) => {
    setDraft((d) => ({
      ...d,
      [side]: getList(d, side).filter((_, i) => i !== idx),
    }));
  };

  const movePort = (from: PortListKey, idx: number, to: PortListKey) => {
    if (from === to) return;
    setDraft((d) => {
      const fromList = getList(d, from);
      const port = fromList[idx];
      if (!port) return d;
      const newDirection: PortDirection =
        to === "inputs" ? "in" : to === "outputs" ? "out" : "bi";
      const moved: Port = { ...port, direction: newDirection };
      const toList = getList(d, to);
      return {
        ...d,
        [from]: fromList.filter((_, i) => i !== idx),
        [to]: [...toList, moved],
      };
    });
  };

  const reorderPort = (side: PortListKey, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setDraft((d) => {
      const list = [...getList(d, side)];
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...d, [side]: list };
    });
  };

  /** Duplique un port en incrémentant le numéro en fin de label.
   *  Exemples : "IN 1" -> "IN 2", "Audio 5" -> "Audio 6", "ABC" -> "ABC 2".
   *  Cherche le prochain numéro libre dans la section pour éviter les
   *  doublons immédiats. Le nouveau port est inséré juste après l'original. */
  const duplicatePort = (side: PortListKey, idx: number) => {
    setDraft((d) => {
      const list = getList(d, side);
      const port = list[idx];
      if (!port) return d;
      const existing = new Set(list.map((p) => p.label));
      const m = port.label.match(/^(.*?)(\d+)\s*$/);
      let prefix: string;
      let n: number;
      if (m) {
        prefix = m[1];
        n = parseInt(m[2], 10);
      } else {
        // Pas de numéro à incrémenter → on en ajoute un (séparé par un espace)
        prefix = port.label.endsWith(" ") || port.label === "" ? port.label : port.label + " ";
        n = 1;
      }
      let candidate: string;
      do {
        n++;
        candidate = `${prefix}${n}`;
      } while (existing.has(candidate));
      const newPort: Port = {
        ...port,
        id: `${side}-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: candidate,
      };
      const next = [...list];
      next.splice(idx + 1, 0, newPort);
      return { ...d, [side]: next };
    });
  };

  return {
    setPort,
    addPort,
    addSpacer,
    addSeparator,
    removePort,
    movePort,
    reorderPort,
    duplicatePort,
  };
}
