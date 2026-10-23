import { IMPORT_MODELS, downloadImportModel } from "../data/importModels";

export default function ImportsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Administration · SharePoint</span>
          <h1>Modèles d'import</h1>
          <p className="lead">Téléchargez le modèle CSV correspondant à chaque liste SharePoint. Respectez les en-têtes et les clés de liaison avant import.</p>
        </div>
        <span className="auto-chip"><i></i>{IMPORT_MODELS.length} listes disponibles</span>
      </div>
      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Listes SharePoint</h2>
          <p className="sub">Les modèles sont compatibles avec les listes configurées dans power.config.json.</p>
        </div>
        <div className="tbl-wrap">
          <table className="vt rt">
            <thead><tr><th>Liste</th><th>Utilisation</th><th>Colonnes</th><th></th></tr></thead>
            <tbody>
              {IMPORT_MODELS.map((model) => (
                <tr key={model.file}>
                  <td><b>{model.title}</b><div className="hint">{model.file}</div></td>
                  <td>{model.description}</td>
                  <td className="mono">{model.headers.length}</td>
                  <td><button type="button" className="btn-ghost sm" onClick={() => downloadImportModel(model)}>Télécharger le modèle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint">Après import, conservez les colonnes Id et ...Id comme clés texte avant de créer les colonnes Lookup SharePoint.</p>
    </div>
  );
}
