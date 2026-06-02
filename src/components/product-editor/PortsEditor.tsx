import { useMemo, useState } from "react";
import { useAppStore } from "../../store";
import { type Port, type PortDirection, type SignalType } from "../../types";
import { type PortListKey } from "./types";

const SECTION_LABELS: Record<PortListKey, string> = {
  inputs: "Gauche",
  outputs: "Droite",
  middle: "Milieu",
};

export function PortsEditor({
  title,
  ports,
  section,
  onAdd,
  onAddSpacer,
  onAddSeparator,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  onReorder,
}: {
  title: string;
  ports: Port[];
  section: PortListKey;
  onAdd: () => void;
  onAddSpacer?: () => void;
  onAddSeparator?: () => void;
  onChange: (i: number, patch: Partial<Port>) => void;
  onRemove: (i: number) => void;
  onDuplicate: (i: number) => void;
  onMove: (i: number, to: PortListKey) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  defaultDirection: PortDirection;
}) {
  const signals = useAppStore((s) => s.signals);
  const signalOptions = useMemo(() => Object.values(signals), [signals]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  return (
    <div className="ports-editor">
      <div className="ports-editor-header">
        <h4>{title}</h4>
        <div className="ports-editor-add-group">
          <button onClick={onAdd}>+ Ajouter</button>
          {onAddSpacer && (
            <button
              onClick={onAddSpacer}
              title="Insérer une ligne vide (saut de ligne, pas de pastille de connexion)"
            >
              + Espace
            </button>
          )}
          {onAddSeparator && (
            <button
              onClick={onAddSeparator}
              title="Insérer une ligne pointillée sur toute la largeur du bloc"
            >
              + Séparateur
            </button>
          )}
        </div>
      </div>
      {ports.length === 0 && <div className="muted">Aucune.</div>}
      {ports.map((p, i) => {
        const isSpacer = p.kind === "spacer";
        const isSeparator = p.kind === "separator";
        const isDecorative = isSpacer || isSeparator;
        return (
          <div
            key={i}
            className={"port-edit-row"
              + (dragIdx === i ? " dragging" : "")
              + (isDecorative ? " port-edit-row-decorative" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i);
              setDragIdx(null);
            }}
          >
            <span
              className="instance-drag-handle"
              title="Glisser pour réordonner"
              draggable
              onDragStart={(e) => {
                setDragIdx(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragIdx(null)}
            >
              ≡
            </span>
            {isDecorative ? (
              <>
                <span className="port-decorative-label">
                  {isSpacer ? "— Espace —" : "— Séparateur —"}
                </span>
                <select
                  value={section}
                  title="Déplacer dans une autre section"
                  onChange={(e) => onMove(i, e.target.value as PortListKey)}
                  className="port-section-select"
                >
                  {(Object.keys(SECTION_LABELS) as PortListKey[]).map((s) => (
                    <option key={s} value={s}>
                      {SECTION_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button onClick={() => onRemove(i)} title="Supprimer">
                  ✕
                </button>
              </>
            ) : (
              <>
                <span className="port-dot" style={{ background: signals[p.signal]?.color ?? "#888" }} />
                <input
                  value={p.label}
                  onChange={(e) => onChange(i, { label: e.target.value })}
                  placeholder="Libellé"
                />
                <select
                  value={p.signal}
                  onChange={(e) => onChange(i, { signal: e.target.value as SignalType })}
                >
                  {signalOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  value={section}
                  title="Déplacer dans une autre section"
                  onChange={(e) => onMove(i, e.target.value as PortListKey)}
                  className="port-section-select"
                >
                  {(Object.keys(SECTION_LABELS) as PortListKey[]).map((s) => (
                    <option key={s} value={s}>
                      {SECTION_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => onDuplicate(i)}
                  title="Dupliquer ce port (incrémente le numéro)"
                  className="port-dup-btn"
                >
                  ⎘
                </button>
                <button onClick={() => onRemove(i)} title="Supprimer">
                  ✕
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
