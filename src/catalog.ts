import type { Product, SignalType } from "./types";

const port = (
  id: string,
  label: string,
  signal: SignalType,
  direction: "in" | "out" | "bi" = "in",
) => ({ id, label, signal, direction });

export const BUILTIN_CATALOG: Product[] = [
  {
    id: "extron-dmp64-c-at",
    reference: "DMP 64+ C AT",
    manufacturer: "Extron",
    category: "DSP audio",
    inputs: [
      port("in1", "1 in", "AUDIO", "in"),
      port("in2", "2 in", "AUDIO", "in"),
      port("in3", "3 in", "XLR", "in"),
      port("in4", "4 in", "AUDIO", "in"),
      port("dante", "DANTE", "DANTE", "in"),
      port("usb", "USB audio", "USB", "in"),
    ],
    outputs: [
      port("out1", "1 out", "AUDIO", "out"),
      port("out2", "2 out", "AUDIO", "out"),
      port("out3", "3 out", "AUDIO", "out"),
      port("out4", "4 out", "AUDIO", "out"),
    ],
  },
  {
    id: "viewsonic-ifp75g1",
    reference: "IFP75G1",
    manufacturer: "Viewsonic",
    category: "Écran tactile 75\"",
    inputs: [
      port("hdmi1", "HDMI in 1", "HDMI", "in"),
      port("hdmi2", "HDMI in 2", "HDMI", "in"),
      port("lan", "LAN", "RJ45", "in"),
      port("rs232", "RS232", "RS232", "in"),
      port("usbtouch", "USB Touch", "USB", "in"),
    ],
    outputs: [port("usba", "USB-A", "USB", "out")],
  },
  {
    id: "viewsonic-cde5514",
    reference: "CDE5514",
    manufacturer: "Viewsonic",
    category: "Écran de vignettage 55\"",
    inputs: [
      port("hdmi1", "HDMI in 1", "HDMI", "in"),
      port("hdmi2", "HDMI in 2", "HDMI", "in"),
      port("rs232", "RS232", "RS232", "in"),
      port("lan", "LAN", "RJ45", "in"),
    ],
    outputs: [],
  },
  {
    id: "viewsonic-umb202",
    reference: "UMB202",
    manufacturer: "Viewsonic",
    category: "Caméra PTZ",
    inputs: [port("poe", "POE", "POE", "in")],
    outputs: [port("usbc", "USB-C 3.0", "USB-C", "out")],
  },
  {
    id: "panasonic-aw-ue4",
    reference: "AW-UE4",
    manufacturer: "Panasonic",
    category: "Caméra PTZ",
    inputs: [
      port("usbc", "USB-C", "USB-C", "in"),
      port("rs232", "DIN RS232", "RS232", "in"),
    ],
    outputs: [port("lan", "LAN", "RJ45", "out")],
  },
  {
    id: "lindy-extender-hdmi",
    reference: "Extendeur HDMI Tx/Rx",
    manufacturer: "Lindy",
    category: "Extendeur HDMI",
    inputs: [port("hdmi", "HDMI in", "HDMI", "in")],
    outputs: [
      port("lan", "LAN", "RJ45", "out"),
      port("hdmiout", "HDMI Out", "HDMI", "out"),
    ],
  },
  {
    id: "netio-8qs-eu",
    reference: "Netio 8QS-EU",
    manufacturer: "Netio",
    category: "Multiprise IP",
    inputs: [port("lan", "LAN", "RJ45", "in")],
    outputs: Array.from({ length: 8 }, (_, i) =>
      port(`p${i + 1}`, `Port ${i + 1}`, "POWER", "out"),
    ),
  },
  {
    id: "extron-ocs100",
    reference: "OCS 100",
    manufacturer: "Extron",
    category: "Capteur de présence",
    inputs: [port("v24", "24V", "POWER", "in")],
    outputs: [
      port("d1", "Digital out 1", "RS232", "out"),
      port("d2", "Digital out 2", "RS232", "out"),
    ],
  },
  {
    id: "sennheiser-tcc2",
    reference: "TeamConnect 2",
    manufacturer: "Sennheiser",
    category: "Microphone plafond",
    inputs: [],
    outputs: [
      port("dante", "DANTE", "DANTE", "out"),
      port("analog", "Analog Out", "AUDIO", "out"),
      port("lan", "LAN/PoE", "POE", "out"),
    ],
  },
  {
    id: "audio-technica-atw1422",
    reference: "ATW-1422",
    manufacturer: "Audio Technica",
    category: "Micro main HF",
    inputs: [],
    outputs: [port("xlr", "XLR Audio", "XLR", "out")],
  },
];

export interface ImportSearchResult {
  reference: string;
  manufacturer: string;
  category: string;
  description?: string;
}

// Stub for vendor catalog import. A real implementation would call the
// Extron product API (or scrape the public catalogue) on the user's behalf.
export async function searchVendorCatalog(
  query: string,
  vendor: "Extron" | "Viewsonic" | "Lindy" | "Panasonic" | "All" = "All",
): Promise<ImportSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return BUILTIN_CATALOG.filter(
    (p) =>
      (vendor === "All" || p.manufacturer === vendor) &&
      (p.reference.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q)),
  ).map((p) => ({
    reference: p.reference,
    manufacturer: p.manufacturer,
    category: p.category,
  }));
}
