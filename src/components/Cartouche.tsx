import { useAppStore } from "../store";
import type { ProjectMeta } from "../types";

export function Cartouche() {
  const meta = useAppStore((s) => s.projectMeta);
  const update = useAppStore((s) => s.updateProjectMeta);

  const setField = (k: keyof ProjectMeta) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update({ [k]: e.target.value });

  return (
    <div className="cartouche">
      <div className="cartouche-cell cartouche-site">
        <input
          className="cartouche-title"
          value={meta.campus}
          onChange={setField("campus")}
          placeholder="Campus / Site"
        />
        <input
          className="cartouche-trade"
          value={meta.trade}
          onChange={setField("trade")}
          placeholder="Lot"
        />
        <input
          className="cartouche-date"
          value={meta.date}
          onChange={setField("date")}
          placeholder="Date"
        />
      </div>
      <div className="cartouche-cell cartouche-client">
        <span className="cartouche-label">CLIENT :</span>
        <input
          className="cartouche-client-name"
          value={meta.client}
          onChange={setField("client")}
          placeholder="Nom client"
        />
      </div>
      <div className="cartouche-cell cartouche-be">
        <input
          className="cartouche-be-name"
          value={meta.bureauEtude}
          onChange={setField("bureauEtude")}
          placeholder="Bureau d'étude"
        />
        <input
          className="cartouche-author"
          value={meta.authorName}
          onChange={setField("authorName")}
          placeholder="Auteur"
        />
        <input
          className="cartouche-version"
          value={meta.version}
          onChange={setField("version")}
          placeholder="V1.0"
        />
      </div>
    </div>
  );
}
