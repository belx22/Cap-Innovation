import { useState } from "react";
import { SETTING_CATALOGS, type SettingCategory } from "../data/reference";
import { persistAppSettings } from "../lib/sharepointSync";
import { useStore } from "../state/store";

const CATEGORIES: { key: SettingCategory; label: string; help: string }[] = [
  { key: "origines_dossier", label: "Origines du dossier", help: "Liste proposée lors de la création et de la modification d'une initiative." },
  { key: "axes_bsc", label: "Axes BSC", help: "Axes de rattachement utilisés dans la fiche initiative." },
  { key: "types_veille", label: "Types de veille", help: "Forum, conférence, benchmark et autres formats de veille." },
  { key: "natures_gouvernance", label: "Natures de livrable", help: "Livrables des initiatives Cadrage & Gouvernance." },
];

export default function SettingsPage() {
  const { bump, toast, sharePointReady } = useStore();
  const [category, setCategory] = useState<SettingCategory>("origines_dossier");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const values = SETTING_CATALOGS[category];
  const meta = CATEGORIES.find((item) => item.key === category)!;

  async function save(next: string[]) {
    if (!sharePointReady || saving) return;
    setSaving(true);
    try {
      await persistAppSettings(category, next);
      values.splice(0, values.length, ...next);
      bump();
      toast("Paramètres enregistrés dans SharePoint");
      setDraft("");
      setEditing(null);
    } catch (error) {
      toast(`Enregistrement impossible : ${error instanceof Error ? error.message : "Erreur SharePoint"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    const value = draft.trim();
    if (!value) return toast("Saisissez une valeur", "error");
    if (values.some((item, index) => index !== editing && item.toLocaleLowerCase("fr") === value.toLocaleLowerCase("fr"))) return toast("Cette valeur existe déjà", "error");
    const next = [...values];
    if (editing == null) next.push(value); else next[editing] = value;
    void save(next);
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    void save(next);
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
    <div className="top"><div><span className="eyebrow">Administration · Référentiels</span><h1>Paramètres</h1><p className="lead">Gérez les valeurs proposées dans les formulaires sans modifier le code. Les changements sont partagés via SharePoint.</p></div></div>
    <div className="panel pad">
      <div className="types" role="tablist" aria-label="Catégories de paramètres">
        {CATEGORIES.map((item) => <button type="button" className={`type${category === item.key ? " sel" : ""}`} key={item.key} onClick={() => { setCategory(item.key); setDraft(""); setEditing(null); }}><b>{item.label}</b><small>{SETTING_CATALOGS[item.key].length} valeur(s)</small></button>)}
      </div>
    </div>
    <div className="panel">
      <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}><h2>{meta.label}</h2><p className="sub">{meta.help}</p></div>
      <div className="tbl-wrap"><table className="vt rt"><thead><tr><th>Ordre</th><th>Valeur affichée</th><th>Actions</th></tr></thead><tbody>
        {values.map((value, index) => <tr key={`${value}-${index}`}><td className="mono">{index + 1}</td><td><b>{value}</b></td><td><div className="row" style={{ justifyContent: "flex-start", gap: 6 }}><button type="button" className="btn-ghost sm" disabled={saving || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="btn-ghost sm" disabled={saving || index === values.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="btn-ghost sm" disabled={saving} onClick={() => { setEditing(index); setDraft(value); }}>Modifier</button><button type="button" className="btn-ghost sm danger" disabled={saving || values.length <= 1} onClick={() => void save(values.filter((_, itemIndex) => itemIndex !== index))}>Supprimer</button></div></td></tr>)}
      </tbody></table></div>
      <div className="pad"><div className="cben-grid"><label className="field">{editing == null ? "Nouvelle valeur" : "Modifier la valeur"}<input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={120} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} /></label><button type="button" className="btn red" disabled={saving || !sharePointReady} onClick={submit}>{saving ? "Enregistrement…" : editing == null ? "Ajouter" : "Enregistrer"}</button>{editing != null && <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setDraft(""); }}>Annuler</button>}</div></div>
    </div>
  </div>;
}
