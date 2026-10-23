import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { actions as computeActions, fmtN, isReco, normBens, benState } from "../lib/domain";
import { LBL } from "../data/templates";
import { TODAY, TODAY_LABEL, d, days, fmt } from "../lib/dates";
import type { Initiative, Benefice, Jalon } from "../data/types";

type Kind = "val" | "just" | "mes";
type Filter = "" | Kind;

interface QueueItem {
  kind: Kind;
  i: Initiative;
  j?: Jalon;
  b?: Benefice;
}

export default function ActionsPage({ onOpenJalon }: { onOpenJalon: (id: string) => void }) {
  const { scopedInnos: innos, scopedLog: log } = useStore();
  const [filter, setFilter] = useState<Filter>("");

  const acts = useMemo(() => computeActions(innos), [innos]);
  const benMeasures = useMemo(() => {
    const out: { i: Initiative; b: Benefice }[] = [];
    innos
      .filter((i) => !isReco(i))
      .forEach((i) => normBens(i).forEach((b) => {
        if (benState(i, b) === "amesurer") out.push({ i, b });
      }));
    return out;
  }, [innos]);

  const lateCount = useMemo(() => innos.flatMap((i) => i.jalons).filter((j) => j.st === "en_retard").length, [innos]);

  const items = useMemo<QueueItem[]>(
    () => [
      ...acts.map((a) => ({ kind: a.kind as Kind, i: a.i, j: a.j })),
      ...benMeasures.map((m) => ({ kind: "mes" as Kind, i: m.i, b: m.b })),
    ],
    [acts, benMeasures]
  );

  const counts: Record<Filter, number> = {
    "": items.length,
    val: items.filter((x) => x.kind === "val").length,
    just: items.filter((x) => x.kind === "just").length,
    mes: items.filter((x) => x.kind === "mes").length,
  };
  const QF: [Filter, string][] = [
    ["", "Tout"],
    ["val", "À clôturer"],
    ["just", "À déposer"],
    ["mes", "À mesurer"],
  ];

  const visible = items.filter((x) => !filter || x.kind === filter);

  const difs = useMemo(() => {
    const out: { i: Initiative; jt: string; jst: string; at: string; txt: string }[] = [];
    innos.forEach((i) => i.jalons.forEach((j) => j.difs.forEach((x) => out.push({ i, jt: j.t, jst: j.st, at: x.at, txt: x.txt }))));
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  }, [innos]);

  const feed = log.slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">{TODAY_LABEL}</span>
          <h1>Vos décisions en attente</h1>
          <p className="lead">
            L'application suit le planning, relance les porteurs et responsables métier et contrôle les pièces à votre
            place. Il ne vous reste que deux gestes : clôturer une étape ou déposer un justificatif.
          </p>
        </div>
        <span className="auto-chip">
          <i></i>Suivi automatique actif
        </span>
      </div>

      <div className="summary">
        <div className="sum">
          <span className="v">{counts.val}</span>
          <span className="k">Étapes à clôturer</span>
        </div>
        <div className="sum">
          <span className="v">{counts.just}</span>
          <span className="k">Justificatifs à déposer</span>
        </div>
        <div className="sum late">
          <span className="v">{lateCount}</span>
          <span className="k">Jalons en retard</span>
        </div>
      </div>

      <div className="twocol">
        <div className="panel">
          <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <h2>File d'actions</h2>
            <p className="sub">Classée par urgence. Le reste est géré automatiquement.</p>
            <div className="rfilters" role="group" aria-label="Filtrer la file d'actions" style={{ marginTop: 10 }}>
              {QF.filter(([k]) => !k || counts[k]).map(([k, l]) => (
                <button key={k || "all"} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {l}
                  <span className="n">{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="queue">
            {visible.length === 0 && (
              <div className="empty">
                <b>Rien à décider pour le moment</b>
                La prochaine action apparaîtra ici quand un jalon arrivera à échéance.
              </div>
            )}
            {visible.map((x, k) => {
              if (x.kind === "mes" && x.b) {
                const b = x.b;
                return (
                  <div className="act up" key={`mes-${k}`}>
                    <span className="stripe"></span>
                    <div>
                      <h3>Mesurer le bénéfice : {b.lib}</h3>
                      <div className="meta">
                        <span>
                          <b>{x.i.code}</b> {x.i.titre}
                        </span>
                        <span>Mesure prévue le {fmt(b.dmes)}</span>
                        <span>
                          Cible {fmtN(b.cib)} {b.unit}
                        </span>
                      </div>
                    </div>
                    <button className="btn" disabled title="La mesure des bénéfices sera disponible dans une prochaine version">
                      Mesurer
                    </button>
                  </div>
                );
              }
              if (!x.j) return null;
              const j = x.j;
              const late = j.st === "en_retard";
              const delta = days(d(j.due), TODAY);
              const when = late ? (
                <b style={{ color: "var(--late)" }}>{delta} j de retard</b>
              ) : delta > 0 ? (
                `échu depuis ${delta} j`
              ) : delta === 0 ? (
                "échéance aujourd'hui"
              ) : (
                `échéance dans ${-delta} j`
              );
              return (
                <div className={`act ${late ? "late" : x.kind === "just" ? "up" : ""}`} key={j.id}>
                  <span className="stripe"></span>
                  <div>
                    <h3>{j.t}</h3>
                    <div className="meta">
                      <span>
                        <b>{x.i.code}</b> {x.i.titre}
                      </span>
                      <span>
                        {fmt(j.due)} · {when}
                      </span>
                      <span>
                        {x.kind === "val" ? `Pièce reçue : ${j.f.at(-1)?.n}` : `Pièce attendue : ${j.req}`}
                      </span>
                    </div>
                  </div>
                  <button className={`btn ${x.kind === "just" ? "red" : ""}`} onClick={() => onOpenJalon(j.id)}>
                    {x.kind === "val" ? "Clôturer l'étape" : "Ajouter le justificatif"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <div className="panel">
            <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
              <h2>Fait pour vous aujourd'hui</h2>
              <p className="sub">Dernières opérations automatiques</p>
            </div>
            <div className="feed">
              {feed.map((l, k) => (
                <div className="feed-i" key={k}>
                  <span className="t">{l.at.split(" ")[1]}</span>
                  <p>
                    {!l.sys && <b>Vous · </b>}
                    {l.m}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
              <h2>Difficultés remontées</h2>
              <p className="sub">Signalées sur les étapes, transmises aux responsables métier et chefs de département</p>
            </div>
            <div className="difs">
              {difs.length === 0 && <div className="empty">Aucune difficulté signalée.</div>}
              {difs.map((x, k) => (
                <div className="dif-i" key={k}>
                  <span className="m">
                    <b>{x.i.code}</b> · {x.jt} · {fmt(x.at)} · <span className={`chip c-${x.jst}`}>{LBL[x.jst]}</span>
                  </span>
                  <p>{x.txt}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
