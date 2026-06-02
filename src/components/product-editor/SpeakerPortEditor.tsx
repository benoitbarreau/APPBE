import { useMemo } from "react";
import { useAppStore } from "../../store";
import { type Port, type SignalType } from "../../types";

// ── Éditeur de port simplifié pour Enceintes / Caisson de basse ─────────────
export function SpeakerPortEditor({
  port,
  onSet,
  onRemove,
  onChange,
}: {
  port: Port | null;
  onSet: (port: Port) => void;
  onRemove: () => void;
  onChange: (patch: Partial<Port>) => void;
}) {
  const signals = useAppStore((s) => s.signals);
  const signalOptions = useMemo(() => Object.values(signals), [signals]);

  return (
    <div className="ports-editor">
      <div className="ports-editor-header">
        <h4>
          Port{" "}
          <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>
            (dupliqué aux 4 coins)
          </span>
        </h4>
      </div>
      {!port ? (
        <>
          <div className="muted" style={{ marginBottom: 6 }}>
            Aucun port défini.
          </div>
          <button
            onClick={() => {
              const first = signalOptions[0];
              onSet({
                id: `speaker-${Date.now()}`,
                label: "",
                signal: first?.id ?? "",
                direction: "bi",
              });
            }}
          >
            + Définir le port
          </button>
        </>
      ) : (
        <div className="port-edit-row">
          <span
            className="port-dot"
            style={{ background: signals[port.signal]?.color ?? "#888" }}
          />
          <select
            value={port.signal}
            onChange={(e) => onChange({ signal: e.target.value as SignalType })}
          >
            {signalOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button onClick={onRemove} title="Supprimer le port">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
