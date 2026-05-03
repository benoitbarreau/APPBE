export type SignalType =
  | "HDMI"
  | "RJ45"
  | "USB"
  | "USB-C"
  | "RS232"
  | "DTP"
  | "EBUS"
  | "AUDIO"
  | "HP"
  | "DANTE"
  | "POE"
  | "POWER"
  | "DP"
  | "JACK"
  | "XLR"
  | "FIBER";

export type PortDirection = "in" | "out" | "bi";

export interface Port {
  id: string;
  label: string;
  signal: SignalType;
  direction: PortDirection;
}

export interface Product {
  id: string;
  reference: string;
  manufacturer: string;
  category: string;
  inputs: Port[];
  outputs: Port[];
}

export interface PlacedProduct {
  id: string;
  productId: string;
  name: string;
  position: { x: number; y: number };
}

export interface Cable {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
  signal: SignalType;
  cableType: string;
  lengthMeters: number;
  label?: string;
}

export const SIGNAL_COLORS: Record<SignalType, string> = {
  HDMI: "#8B4FBA",
  RJ45: "#7FC97F",
  USB: "#A0522D",
  "USB-C": "#A0522D",
  RS232: "#00BFD8",
  DTP: "#5BC0EB",
  EBUS: "#1F4E96",
  AUDIO: "#F5C432",
  HP: "#E63946",
  DANTE: "#7FC97F",
  POE: "#7FC97F",
  POWER: "#000000",
  DP: "#8B4FBA",
  JACK: "#F5C432",
  XLR: "#F5C432",
  FIBER: "#FF6F00",
};

export const SIGNAL_DEFAULT_CABLE: Record<SignalType, string> = {
  HDMI: "HDMI 2.0",
  RJ45: "RJ45 Cat6",
  USB: "USB 2.0 A/A",
  "USB-C": "USB-C 3.0",
  RS232: "RS232 DB9",
  DTP: "STP22-2",
  EBUS: "STP22-2",
  AUDIO: "Mini-Jack 3.5",
  HP: "HP 2x2.5mm²",
  DANTE: "RJ45 Cat6 Dante",
  POE: "RJ45 Cat6 PoE+",
  POWER: "Cordon secteur",
  DP: "DisplayPort",
  JACK: "Mini-Jack 3.5",
  XLR: "XLR 3 broches",
  FIBER: "Fibre OM4",
};
