export type SignalType = string;

export type PortDirection = "in" | "out" | "bi";

export interface Port {
  id: string;
  label: string;
  signal: SignalType;
  direction: PortDirection;
}

export type RackSize = "19" | "10";
export type RackWidth = "full" | "half" | "quarter";

export interface Product {
  id: string;
  reference: string;
  manufacturer: string;
  category: string;
  inputs: Port[];
  outputs: Port[];
  middle?: Port[];
  articleCode?: string;
  productUrl?: string;
  rackHeightU?: number;
  rackSize?: RackSize;
  rackWidth?: RackWidth;
  imageFront?: string;
  imageBack?: string;
}

export type PortPlacement = "left" | "right" | "middle";

export interface PlacedProduct {
  id: string;
  productId: string;
  name: string;
  position: { x: number; y: number };
  zoneId?: string;
  /** Étiquette libre affichée sur le bloc (ex. numéro d'inventaire, nom court). */
  label?: string;
  portOverrides?: Record<string, PortPlacement>;
  portLabelOverrides?: Record<string, string>;
  portOrder?: string[];
  extraPorts?: Port[];
}

export interface Zone {
  id: string;
  label: string;
  color: string;
}

export type PortSide = "in" | "out" | "midL" | "midR";

export interface Cable {
  id: string;
  number: string;
  fromNodeId: string;
  fromPortId: string;
  fromPortSide?: PortSide;
  toNodeId: string;
  toPortId: string;
  toPortSide?: PortSide;
  signal: SignalType;
  cableType: string;
  /** Longueur en mètres. Vide (undefined) à la création, à renseigner par l'utilisateur. */
  lengthMeters?: number;
  label?: string;
  labelOffset?: { x: number; y: number };
  reversed?: boolean;
  waypoints?: { x: number; y: number }[];
}

export interface ProjectMeta {
  campus: string;
  lieu: string;
  client: string;
  bureauEtude: string;
  trade: string;
  authorName: string;
  version: string;
  date: string;
}

/** Un synoptique au sein d'un projet (= un onglet) */
export interface Tab {
  id: string
  name: string
  trade?: string   // Lot propre à cet onglet
  nodes: PlacedProduct[]
  cables: Cable[]
  zones: Zone[]
}

export interface SignalDef {
  id: string;
  label: string;
  color: string;
  defaultCable: string;
  numberPrefix: string;
}

export const DEFAULT_SIGNAL_DEFS: Record<string, SignalDef> = {
  HDMI: { id: "HDMI", label: "HDMI / DP", color: "#8B4FBA", defaultCable: "HDMI 2.0", numberPrefix: "HDMI" },
  RJ45: { id: "RJ45", label: "RJ45 / IP", color: "#7FC97F", defaultCable: "RJ45 Cat6", numberPrefix: "IP" },
  USB: { id: "USB", label: "USB", color: "#A0522D", defaultCable: "USB 2.0 A/A", numberPrefix: "USB" },
  "USB-C": { id: "USB-C", label: "USB-C", color: "#A0522D", defaultCable: "USB-C 3.0", numberPrefix: "USBC" },
  RS232: { id: "RS232", label: "RS232", color: "#00BFD8", defaultCable: "RS232 DB9", numberPrefix: "COM" },
  DTP: { id: "DTP", label: "DTP / XTP / HDBaseT", color: "#5BC0EB", defaultCable: "STP22-2", numberPrefix: "DTP" },
  EBUS: { id: "EBUS", label: "eBUS / Cresnet", color: "#1F4E96", defaultCable: "STP22-2", numberPrefix: "EB" },
  AUDIO: { id: "AUDIO", label: "Audio", color: "#F5C432", defaultCable: "Mini-Jack 3.5", numberPrefix: "AU" },
  HP: { id: "HP", label: "HP", color: "#E63946", defaultCable: "HP 2x2.5mm²", numberPrefix: "HP" },
  DANTE: { id: "DANTE", label: "Dante", color: "#7FC97F", defaultCable: "RJ45 Cat6 Dante", numberPrefix: "DA" },
  POE: { id: "POE", label: "PoE", color: "#7FC97F", defaultCable: "RJ45 Cat6 PoE+", numberPrefix: "POE" },
  POWER: { id: "POWER", label: "Secteur", color: "#000000", defaultCable: "Cordon secteur", numberPrefix: "P" },
  DP: { id: "DP", label: "DisplayPort", color: "#8B4FBA", defaultCable: "DisplayPort", numberPrefix: "DP" },
  JACK: { id: "JACK", label: "Jack", color: "#F5C432", defaultCable: "Mini-Jack 3.5", numberPrefix: "JK" },
  XLR: { id: "XLR", label: "XLR", color: "#F5C432", defaultCable: "XLR 3 broches", numberPrefix: "XLR" },
  FIBER: { id: "FIBER", label: "Fibre", color: "#FF6F00", defaultCable: "Fibre OM4", numberPrefix: "FB" },
};
