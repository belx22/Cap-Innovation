import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { RULES } from "../data/automationRules";

export default function AutoPage() {
  const { scopedInnos: innos, scopedLog: log } = useStore();
  const [ini, setIni] = useState("");
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(
    () => log.filter((l) => (!ini || l.m.startsWith(ini + " ")) && (!who || (who === "auto") === !!l.sys) && (!from || l.at.slice(0, 10) >= from) && (!to || l.at.slice(0, 10) <= to)),
    [log, ini, who, from, to]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Ce que l'application fait seule</span>
          <h1>Automatisations</h1>
          <p className="lead">
            Les règles ci-dessous remplacent les relances, les points d'avancement et les reportings manuels. Le
            journal trace chaque opération, automatique ou humaine.
          </p>
        </div>
      </div>

      <div className="rules">
        {RULES.map((r) => (
          <div className="rule" key={r.t}>
            <h3>{r.t}</h3>
            <p>{r.p}</p>
            <div className="row"><span className="chip c-valide">Active</span></div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Journal</h2>
          <p className="sub">Les interventions humaines sont signalées en rouge</p>
        </div>
        <div className="fbar in">
          <label className="fb">
            Initiative
            <select value={ini} onChange={(e) => setIni(e.target.value)}>
              <option value="">Toutes</option>
              {innos.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.code}
                </option>
              ))}
            </select>
          </label>
          <label className="fb">
            Auteur
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Tous</option>
              <option value="auto">Automatique</option>
              <option value="hum">Humain</option>
            </select>
          </label>
          <label className="fb">Date du<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="fb">au<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <span className="fcount">
            {filtered.length} opération{filtered.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="log">
          {filtered.length === 0 && <div className="empty">Aucune opération ne correspond aux filtres.</div>}
          {filtered.map((l, k) => (
            <div className="log-i" key={k}>
              <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
                {l.at}
              </span>
              <span className={`who ${l.sys ? "sys" : "hum"}`}>{l.sys ? "Automatique" : l.who || "Gestionnaire"}</span>
              <span>{l.m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
