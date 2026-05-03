import { SIGNAL_COLORS, type SignalType } from "../types";

const ITEMS: { signal: SignalType; label: string }[] = [
  { signal: "HDMI", label: "HDMI / DP" },
  { signal: "RJ45", label: "RJ45 / IP" },
  { signal: "USB", label: "USB / USB-C" },
  { signal: "RS232", label: "RS232" },
  { signal: "DTP", label: "DTP / XTP / HDBaseT" },
  { signal: "EBUS", label: "eBUS / Cresnet" },
  { signal: "AUDIO", label: "Audio" },
  { signal: "HP", label: "HP" },
  { signal: "FIBER", label: "Fibre" },
];

export function Legend() {
  return (
    <div className="legend">
      {ITEMS.map((it) => (
        <div key={it.signal} className="legend-item">
          <span
            className="legend-bar"
            style={{ background: SIGNAL_COLORS[it.signal] }}
          />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
