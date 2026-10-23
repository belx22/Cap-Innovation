import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { TEMPLATES, tDur, type TemplateKey } from "../data/templates";
import { AXES_BSC, ORIGINES_DOSSIER, TYPES_VEILLE, NATURES_GOUVERNANCE, DEPTS, PILIERS, PROGS, USERS, deptName, userOf } from "../data/reference";
import DirectoryUserField from "./DirectoryUserField";
import { benT, fmtN, numv } from "../lib/domain";
import { TODAY, TODAY_ISO, addWork, fmt, fmtY, days, d, iso } from "../lib/dates";
import { defaultDurs, schedule, tplKey, EXTRA_TK_BASE, type CreateDraft, type ExtraStep } from "../lib/schedule";
import type { Benefice, Initiative, InitiativeType, Jalon } from "../data/types";

type InitType = string;

const BUILT_IN_CARDS: { key: InitType; label: string; desc: string }[] = [
  { key: "projet", label: "Projet", desc: "Classique ou IT. Transformation interne, outil ou processus ; un projet IT ajoute spécifications, tests QA et mise en production." },
  { key: "produit", label: "Produit", desc: "Nouvelle offre pour les clients : étude de marché, conception, avis du comité produits, paramétrage, formation du réseau, lancement." },
  { key: "etude", label: "Étude", desc: "Analyse ponctuelle pour éclairer une décision : idée d'étude, protocole, puis rapport avec ou sans descente sur le terrain." },
  { key: "veille", label: "Veille", desc: "Forum, foire, salon, conférence ou benchmark : participation, puis compte rendu et recommandations utiles à la Banque." },
  { key: "maintenance", label: "Maintenance", desc: "Évolution ou correction d'une application existante : réception et analyse du besoin, implémentation, tests avec le métier, mise en production, suivi des bénéfices." },
  { key: "gouvernance", label: "Cadrage & Gouvernance", desc: "Procédures, chartes de gouvernance, politiques, notes d'organisation : cadrage, diagnostic, rédaction, consultation, approbation, diffusion et suivi." },
];

function hintFor(key: string): string {
  if (key === "veille") return "2 étapes · dates de l'événement";
  if (key === "etude") return "3 étapes · 6 semaines avec terrain, 4 sans";
  if (key === "projet") return `${TEMPLATES.projet.steps.length} étapes (classique) · ${TEMPLATES.projet_it.steps.length} étapes (IT)`;
  const t = TEMPLATES[key];
  if (t.custom) return `${t.steps.length} étapes · ${tDur(t.steps)} jours ouvrés · ${t.reco ? "recommandations" : "bénéfices attendus"}`;
  return `${t.steps.length} étapes · ${tDur(t.steps)} jours ouvrés par défaut`;
}

interface DraftBen {
  id?: string;
  lib: string;
  dep: string;
  cib: string;
  unit: string;
  dmes?: string;
  val?: string;
  res?: string;
  mesAt?: string;
  pendDel?: string;
}

interface StepFile {
  name: string;
  size: string;
}

function sizeOf(file: File): string {
  const kb = file.size / 1024;
  return kb > 1024 ? (kb / 1024).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(kb)) + " Ko";
}

export interface InitiativeFormProps {
  mode: "create" | "edit";
  /** Initiative existante à modifier : fournit les valeurs de pré-remplissage en mode "edit". */
  initial?: Initiative;
  /** Mode "create" uniquement. */
  onCreated?: () => void;
  /** Mode "edit" uniquement : patch des champs effectivement modifiés, à router vers le circuit de validation. */
  onSubmit?: (patch: Partial<Initiative>) => void;
  /** Mode "edit" uniquement. */
  onCancel?: () => void;
}

export default function InitiativeForm({ mode, initial, onCreated, onSubmit, onCancel }: InitiativeFormProps) {
  const { innos, createInitiative, toast, tick, scopeDept, profile, me, sharePointReady } = useStore();
  const isEdit = mode === "edit";

  const typeCards = useMemo(() => {
    const custom = Object.entries(TEMPLATES)
      .filter(([, t]) => t.custom && t.active)
      .map(([k, t]) => ({ key: k, label: t.label, desc: t.desc || "Type conçu par l'administrateur." }));
    return [...BUILT_IN_CARDS, ...custom];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const [type, setType] = useState<InitType>(initial?.type ?? "projet");
  const [it, setIt] = useState(initial?.it ?? false);
  const [terrain, setTerrain] = useState(initial?.terrain ?? true);
  const [vtype, setVtype] = useState(initial?.vtype ?? TYPES_VEILLE[0] ?? "");
  const [gnat, setGnat] = useState(initial?.gnat ?? NATURES_GOUVERNANCE[0] ?? "");
  const initialKey = (initial?.type === "projet" && initial.it ? "projet_it" : initial?.type || "projet") as TemplateKey;
  const initialTemplate = TEMPLATES[initialKey];
  const [skip, setSkip] = useState<Set<number>>(() => new Set(
    initial ? initialTemplate.steps.map((step, index) => initial.jalons.some((jalon) => jalon.t === step.t) ? -1 : index).filter((index) => index >= 0) : []
  ));
  const [durs, setDurs] = useState<number[]>(() => initial
    ? initialTemplate.steps.map((step) => initial.jalons.find((jalon) => jalon.t === step.t)?.dur || step.dur)
    : defaultDurs(initialKey, true));
  const [files, setFiles] = useState<Record<number, StepFile[]>>(() => {
    if (!initial) return {};
    const result: Record<number, StepFile[]> = {};
    initialTemplate.steps.forEach((step, index) => {
      const jalon = initial.jalons.find((item) => item.t === step.t);
      if (jalon?.f.length) result[index] = jalon.f.map((file) => ({ name: file.n, size: file.s }));
    });
    return result;
  });
  const [extraSteps, setExtraSteps] = useState<ExtraStep[]>(() => initial
    ? initial.jalons.filter((jalon) => !initialTemplate.steps.some((step) => step.t === jalon.t)).map((jalon) => ({ t: jalon.t, dur: jalon.dur || 1, req: jalon.req }))
    : []);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStepT, setNewStepT] = useState("");
  const [newStepDur, setNewStepDur] = useState("10");
  const [newStepReq, setNewStepReq] = useState("");

  const [titre, setTitre] = useState(initial?.titre ?? "");
  const [pil, setPil] = useState(initial?.pil ?? "");
  const [prog, setProg] = useState(initial?.prog ?? "");
  const [origineDossier, setOrigineDossier] = useState(initial?.origineDossier ?? "");
  const [origineDossierAutre, setOrigineDossierAutre] = useState(initial?.origineDossierAutre ?? "");
  const [axeBsc, setAxeBsc] = useState(initial?.axeBsc ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [porteurId, setPorteurId] = useState(initial?.porteurId ?? "");
  const [metier, setMetier] = useState(initial?.metier ?? "");
  const [benef, setBenef] = useState(initial?.benef ?? "");
  const [benefTouched, setBenefTouched] = useState(isEdit);
  const [resIT, setResIT] = useState(initial?.resIT ?? "");
  const [part, setPart] = useState(initial?.participants ?? "");
  const [startDate, setStartDate] = useState(initial?.deb ?? initial?.start ?? TODAY_ISO);
  const [vfin, setVfin] = useState(initial?.vfin ?? iso(addWork(TODAY, 2)));
  const [bv, setBv] = useState(initial?.bv ?? "");
  const [bens, setBens] = useState<DraftBen[]>(() => (initial?.bens || []).map((benefit) => ({ ...benefit })));
  const [benLib, setBenLib] = useState("");
  const [benDep, setBenDep] = useState("");
  const [benCib, setBenCib] = useState("");
  const [benUnit, setBenUnit] = useState("");

  const [errField, setErrField] = useState("");
  const [hint, setHint] = useState(
    isEdit
      ? "La modification sera soumise au circuit de validation : vous verrez la liste des changements avant confirmation."
      : "Les relances J-5 et l'escalade des retards seront adressées au porteur et au responsable métier."
  );
  const [hintErr, setHintErr] = useState(false);

  const draft: CreateDraft = useMemo(
    () => ({ type, it, terrain, skip, durs, startDate, vfin, extra: extraSteps }),
    [type, it, terrain, skip, durs, startDate, vfin, extraSteps]
  );
  const key: TemplateKey = tplKey(draft);
  const isVeille = type === "veille";
  const needsBenef = benT(type);
  const canSkip = true;

  const sch = useMemo(() => schedule(draft), [draft]);
  const first = sch[0];
  const last = sch[sch.length - 1];
  const tot = Math.max(1, days(d(first.start), d(last.end)));
  const workDays = sch.reduce((a, s) => a + s.dur, 0);

  function resetTemplate(nextType: InitType, nextIt: boolean, nextTerrain: boolean) {
    const k: TemplateKey = nextType === "projet" && nextIt ? "projet_it" : (nextType as TemplateKey);
    setDurs(defaultDurs(k, nextTerrain));
    setFiles({});
    setSkip(new Set());
    setExtraSteps([]);
  }

  function onChangeType(t: InitType) {
    setType(t);
    resetTemplate(t, it, terrain);
  }
  function onChangeKind(nextIt: boolean) {
    setIt(nextIt);
    resetTemplate(type, nextIt, terrain);
  }
  function onChangeTerrain(nextTerrain: boolean) {
    setTerrain(nextTerrain);
    const idx = TEMPLATES.etude.steps.findIndex((s) => s.terrain);
    if (idx >= 0) {
      const step = TEMPLATES.etude.steps[idx];
      setDurs((prev) => {
        const copy = [...prev];
        copy[idx] = nextTerrain ? step.dur : step.durSans ?? step.dur;
        return copy;
      });
    }
  }

  function addBen() {
    const lib = benLib.trim();
    if (!lib) return;
    if ((benDep && numv(benDep) == null) || (benCib && numv(benCib) == null)) return;
    setBens((b) => [...b, { lib, dep: benDep.trim(), cib: benCib.trim(), unit: benUnit.trim() }]);
    setBenLib("");
    setBenDep("");
    setBenCib("");
    setBenUnit("");
  }

  function handleStepFiles(tk: number, list: FileList | null) {
    if (!list || !list.length) return;
    const added = [...list].map((f) => ({ name: f.name, size: sizeOf(f) }));
    setFiles((prev) => ({ ...prev, [tk]: [...(prev[tk] || []), ...added] }));
  }

  function fail(field: string, msg: string) {
    setErrField(field);
    setHint(msg);
    setHintErr(true);
  }

  function validateCommon(): boolean {
    setErrField("");
    setHintErr(false);
    if (!titre.trim()) {
      fail("titre", "Donnez un intitulé pour l'initiative.");
      return false;
    }
    const PU = userOf(porteurId);
    if (!PU) {
      fail("porteur", "Choisissez le porteur : l'initiative sera rattachée à son département.");
      return false;
    }
    if (!pil) {
      fail("pil", "Choisissez le pilier stratégique de l'initiative.");
      return false;
    }
    if (!prog) {
      fail("prog", "Choisissez le programme stratégique de l'initiative.");
      return false;
    }
    if (!origineDossier) {
      fail("origine", "Précisez l'origine du dossier.");
      return false;
    }
    if (origineDossier === "Autre" && !origineDossierAutre.trim()) {
      fail("origine", "Précisez l'origine du dossier.");
      return false;
    }
    if (!axeBsc) {
      fail("bsc", "Choisissez l'axe BSC de l'initiative.");
      return false;
    }
    if (!isVeille && !metier.trim()) {
      fail("metier", "Désignez le responsable métier.");
      return false;
    }
    const benefFinal = benef.trim() || metier.trim();
    if (needsBenef && !benefFinal) {
      fail("benef", "Désignez le responsable bénéfice.");
      return false;
    }
    if (type === "projet" && it && !resIT.trim()) {
      fail("resIT", "Un projet IT doit avoir un responsable IT.");
      return false;
    }
    if (isVeille && !desc.trim()) {
      fail("desc", "Décrivez la veille en quelques mots.");
      return false;
    }
    if (isVeille && (!vfin || vfin < startDate)) {
      fail("vfin", "La date de fin doit être postérieure ou égale à la date de début.");
      return false;
    }
    if (bv && numv(bv) == null) {
      fail("bv", "Le budget doit être un montant, par exemple 15 000 000.");
      return false;
    }
    return true;
  }

  async function handleCreate() {
    if (!sharePointReady) return fail("sharepoint", "SharePoint est encore en cours de chargement. Réessayez dans quelques secondes.");
    if (!validateCommon()) return;
    const PU = userOf(porteurId)!;
    const benefFinal = benef.trim() || metier.trim();

    const num = innos.reduce((m, i) => Math.max(m, parseInt(i.code.slice(4), 10) || 0), 0) + 1;
    const code = "INI-" + String(num).padStart(2, "0");

    const jalons: Jalon[] = sch.map((s, k) => {
      const stepFiles = (files[s.tk] || []).map((x) => ({ n: x.name, s: x.size, at: startDate, ok: true }));
      return {
        id: `${code}-J${k + 1}`,
        t: s.t,
        due: s.end,
        st: stepFiles.length ? "a_valider" : "a_venir",
        req: s.req,
        charte: s.charte || undefined,
        phase: s.phase,
        dur: s.dur,
        f: stepFiles,
        coms: [],
        difs: [],
      };
    });

    const bensFinal: Benefice[] | undefined = !needsBenef
      ? []
      : bens.map((b, k) => ({ id: `${code}-B${k + 1}`, lib: b.lib, dep: b.dep, cib: b.cib, unit: b.unit, dmes: sch[sch.length - 1].end }));

    const inno: Initiative = {
      code,
      type: type as InitiativeType,
      titre: titre.trim(),
      pil,
      prog,
      origineDossier,
      origineDossierAutre: origineDossier === "Autre" ? origineDossierAutre.trim() : undefined,
      axeBsc,
      porteur: PU.nom,
      porteurId,
      dept: PU.dept,
      phase: 0,
      recos: [],
      terrain: type === "etude" ? terrain : undefined,
      it: type === "projet" && it ? true : undefined,
      metier: isVeille ? undefined : metier.trim(),
      benef: needsBenef ? benefFinal : undefined,
      resIT: (type === "projet" && it) || type === "maintenance" ? resIT.trim() || undefined : undefined,
      gnat: type === "gouvernance" ? gnat : undefined,
      bv: bv ? String(numv(bv)) : "",
      bc: "0",
      vtype: isVeille ? vtype : undefined,
      desc: isVeille ? desc.trim() : undefined,
      deb: isVeille ? startDate : undefined,
      vfin: isVeille ? vfin : undefined,
      participants: isVeille ? part.trim() : undefined,
      jalons,
      bens: bensFinal,
    };

    const created = await createInitiative(inno);
    if (!created) return;
    toast(`${code} créé dans SharePoint · ${jalons.length} jalons planifiés jusqu'au ${fmtY(jalons[jalons.length - 1].due)}`);

    setTitre("");
    setPorteurId("");
    setMetier("");
    setBenef("");
    setBenefTouched(false);
    setResIT("");
    setDesc("");
    setPart("");
    setBv("");
    setPil("");
    setProg("");
    setOrigineDossier("");
    setOrigineDossierAutre("");
    setAxeBsc("");
    setBens([]);
    resetTemplate(type, it, terrain);
    setHint("Les relances J-5 et l'escalade des retards seront adressées au porteur et au responsable métier.");
    onCreated?.();
  }

  function buildEditPatch(): Partial<Initiative> {
    const I = initial!;
    const patch: Partial<Initiative> = {};
    const benefFinal = benef.trim() || metier.trim();
    const titreFinal = titre.trim();
    if (titreFinal !== I.titre) patch.titre = titreFinal;
    if (pil !== (I.pil || "")) patch.pil = pil;
    if (prog !== (I.prog || "")) patch.prog = prog;
    if (origineDossier !== (I.origineDossier || "")) patch.origineDossier = origineDossier;
    const autreFinal = origineDossier === "Autre" ? origineDossierAutre.trim() : "";
    if (autreFinal !== (I.origineDossierAutre || "")) patch.origineDossierAutre = autreFinal || undefined;
    if (axeBsc !== (I.axeBsc || "")) patch.axeBsc = axeBsc;
    if (terrain !== (I.terrain ?? true) && type === "etude") patch.terrain = terrain;
    if (vtype !== (I.vtype || "Forum") && isVeille) patch.vtype = vtype;
    if (gnat !== (I.gnat || "Procédure") && type === "gouvernance") patch.gnat = gnat;
    if (porteurId !== (I.porteurId || "")) {
      const PU = userOf(porteurId);
      if (PU) {
        patch.porteurId = porteurId;
        patch.porteur = PU.nom;
        patch.dept = PU.dept;
      }
    }
    if (!isVeille) {
      const m = metier.trim();
      if (m !== (I.metier || "")) patch.metier = m;
    }
    if (needsBenef && benefFinal !== (I.benef || "")) patch.benef = benefFinal;
    if ((type === "projet" && it) || type === "maintenance") {
      const r = resIT.trim();
      if (r !== (I.resIT || "")) patch.resIT = r;
    }
    if (isVeille) {
      const ds = desc.trim();
      if (ds !== (I.desc || "")) patch.desc = ds;
      const pt = part.trim();
      if (pt !== (I.participants || "")) patch.participants = pt;
      if (startDate !== (I.deb || "")) patch.deb = startDate;
      if (vfin !== (I.vfin || "")) patch.vfin = vfin;
    }
    const bvNorm = bv.trim() ? String(numv(bv) ?? "") : "";
    if (bvNorm !== (I.bv || "")) patch.bv = bvNorm;

    const plannedJalons: Jalon[] = sch.map((step, index) => {
      const existing = I.jalons.find((jalon) => jalon.t === step.t);
      return {
        ...(existing || { id: `${I.code}-J${index + 1}`, st: "a_venir" as const, f: [], coms: [], difs: [] }),
        t: step.t,
        due: step.end,
        req: step.req,
        dur: step.dur,
        charte: step.charte || undefined,
        phase: step.phase,
      };
    });
    const planSignature = (jalons: Jalon[]) => jalons.map(({ id, t, due, req, dur, charte, phase }) => ({ id, t, due, req, dur, charte, phase }));
    if (JSON.stringify(planSignature(plannedJalons)) !== JSON.stringify(planSignature(I.jalons))) patch.jalons = plannedJalons;

    const benefitsFinal: Benefice[] = bens.map((benefit, index) => ({
      ...benefit,
      id: benefit.id || `${I.code}-B${index + 1}`,
      dmes: benefit.dmes || plannedJalons[plannedJalons.length - 1]?.due || TODAY_ISO,
    }));
    if (JSON.stringify(benefitsFinal) !== JSON.stringify(I.bens || [])) patch.bens = benefitsFinal;
    return patch;
  }

  function handleSaveEdit() {
    if (!validateCommon()) return;
    const patch = buildEditPatch();
    if (!Object.keys(patch).length) return fail("", "Aucune modification à enregistrer.");
    onSubmit?.(patch);
  }

  const stepLabel = isVeille
    ? "Calculé à partir des dates de l'événement. Le compte rendu et les recommandations sont attendus 5 jours ouvrés après la fin."
    : "Généré à partir du modèle. Chaque étape devient un jalon, suivi et relancé automatiquement.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">{isEdit ? "Modification d'initiative" : "Nouvelle initiative"}</span>
          <h1>{isEdit ? "Modifier l'initiative" : "Créer une initiative"}</h1>
          <p className="lead">
            {isEdit
              ? "Les mêmes champs qu'à la création, déjà renseignés. Modifiez ce qui doit changer puis enregistrez : la demande part au circuit de validation avec le détail des changements."
              : "Choisissez le type. Les étapes à suivre et leurs dates se calculent aussitôt en jours ouvrés. Vous pouvez ajuster une durée, le reste du planning se décale seul."}
          </p>
        </div>
      </div>

      <div className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {isEdit ? (
          <>
            <div className="types" role="radiogroup" aria-label="Type d'initiative">
              {typeCards.map((card) => (
                <label className="type" key={card.key} aria-disabled={card.key !== type}>
                  <input type="radio" name="c-type-edit" checked={type === card.key} disabled />
                  <b>{card.label}</b>
                  <small>{card.desc}</small>
                  <span className="n">{card.key === type ? `${hintFor(card.key)} · type non modifiable` : hintFor(card.key)}</span>
                </label>
              ))}
            </div>
            {type === "projet" && <div className="terrain"><span className="lbl">Nature du projet</span><div className="seg" role="radiogroup" aria-label="Nature du projet"><label><input type="radio" checked={!it} disabled /><span>Projet classique<small>7 étapes</small></span></label><label><input type="radio" checked={it} disabled /><span>Projet IT<small>Tests QA et mise en production</small></span></label></div></div>}
            {type === "etude" && <div className="terrain"><span className="lbl">Descente sur le terrain</span><div className="seg" role="radiogroup" aria-label="Descente sur le terrain"><label><input type="radio" name="c-terrain-edit" checked={terrain} onChange={() => onChangeTerrain(true)} /><span>Avec descente<small>Rapport en 1 mois</small></span></label><label><input type="radio" name="c-terrain-edit" checked={!terrain} onChange={() => onChangeTerrain(false)} /><span>Sans descente<small>Rapport en 2 semaines</small></span></label></div></div>}
            {isVeille && <div className="terrain"><span className="lbl">Type de veille</span><div className="seg seg5" role="radiogroup" aria-label="Type de veille">{TYPES_VEILLE.map((value) => <label key={value}><input type="radio" name="c-vtype-edit" checked={vtype === value} onChange={() => setVtype(value)} /><span>{value}</span></label>)}</div></div>}
            {type === "gouvernance" && <div className="terrain"><span className="lbl">Nature du livrable</span><div className="seg seg5" role="radiogroup" aria-label="Nature du livrable">{NATURES_GOUVERNANCE.map((value) => <label key={value}><input type="radio" name="c-gnat-edit" checked={gnat === value} onChange={() => setGnat(value)} /><span>{value}</span></label>)}</div></div>}
          </>
        ) : (
          <>
            <div className="types" role="radiogroup" aria-label="Type d'initiative">
              {typeCards.map((t) => (
                <label className="type" key={t.key}>
                  <input type="radio" name="c-type" checked={type === t.key} onChange={() => onChangeType(t.key)} />
                  <b>{t.label}</b>
                  <small>{t.desc}</small>
                  <span className="n">{hintFor(t.key)}</span>
                </label>
              ))}
            </div>

            {type === "projet" && (
              <div className="terrain">
                <span className="lbl">Nature du projet</span>
                <div className="seg" role="radiogroup" aria-label="Nature du projet">
                  <label>
                    <input type="radio" name="c-kind" checked={!it} onChange={() => onChangeKind(false)} />
                    <span>
                      Projet classique<small>7 étapes</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="c-kind" checked={it} onChange={() => onChangeKind(true)} />
                    <span>
                      Projet IT<small>Tests QA et mise en production</small>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {type === "etude" && (
              <div className="terrain">
                <span className="lbl">Descente sur le terrain</span>
                <div className="seg" role="radiogroup" aria-label="Descente sur le terrain">
                  <label>
                    <input type="radio" name="c-terrain" checked={terrain} onChange={() => onChangeTerrain(true)} />
                    <span>
                      Avec descente<small>Rapport en 1 mois</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="c-terrain" checked={!terrain} onChange={() => onChangeTerrain(false)} />
                    <span>
                      Sans descente<small>Rapport en 2 semaines</small>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {isVeille && (
              <div className="terrain">
                <span className="lbl">Type de veille</span>
                <div className="seg seg5" role="radiogroup" aria-label="Type de veille">
                  {TYPES_VEILLE.map((v) => (
                    <label key={v}>
                      <input type="radio" name="c-vtype" checked={vtype === v} onChange={() => setVtype(v)} />
                      <span>{v}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {type === "gouvernance" && (
              <div className="terrain">
                <span className="lbl">Nature du livrable</span>
                <div className="seg seg5" role="radiogroup" aria-label="Nature du livrable">
                  {NATURES_GOUVERNANCE.map((v) => (
                    <label key={v}>
                      <input type="radio" name="c-gnat" checked={gnat === v} onChange={() => setGnat(v)} />
                      <span>{v}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="form-grid">
          <label className={`field wide${errField === "titre" ? " err" : ""}`}>
            Intitulé
            <input
              type="text"
              maxLength={120}
              value={titre}
              onChange={(e) => {
                setTitre(e.target.value);
                setErrField("");
              }}
              placeholder={isVeille ? "Ex. Salon de la banque digitale 2026" : "Ex. Prise de rendez-vous en agence depuis l'application"}
            />
          </label>
          <label className={`field${errField === "pil" ? " err" : ""}`}>
            Pilier stratégique
            <select
              value={pil}
              onChange={(e) => {
                setPil(e.target.value);
                setErrField("");
              }}
            >
              <option value="">Choisir…</option>
              {PILIERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} – {p.lib}
                </option>
              ))}
            </select>
          </label>
          <label className={`field${errField === "prog" ? " err" : ""}`}>
            Programme stratégique
            <select
              value={prog}
              onChange={(e) => {
                setProg(e.target.value);
                setErrField("");
              }}
            >
              <option value="">Choisir…</option>
              {PROGS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} – {p.lib}
                </option>
              ))}
            </select>
          </label>
          <label className={`field${errField === "origine" ? " err" : ""}`}>
            Origine du dossier
            <select value={origineDossier} onChange={(e) => { setOrigineDossier(e.target.value); setErrField(""); }}>
              <option value="">Choisir…</option>
              {ORIGINES_DOSSIER.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          {origineDossier === "Autre" && <label className="field"><span>Préciser l'origine</span><input value={origineDossierAutre} onChange={(e) => setOrigineDossierAutre(e.target.value)} maxLength={120} placeholder="Ex. Demande du réseau" /></label>}
          <label className={`field${errField === "bsc" ? " err" : ""}`}>
            Axe BSC
            <select value={axeBsc} onChange={(e) => { setAxeBsc(e.target.value); setErrField(""); }}>
              <option value="">Choisir…</option>
              {AXES_BSC.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          {isVeille && (
            <label className={`field wide${errField === "desc" ? " err" : ""}`}>
              Description
              <textarea
                maxLength={160}
                rows={2}
                value={desc}
                onChange={(e) => {
                  setDesc(e.target.value);
                  setErrField("");
                }}
                placeholder="Objet de la veille, thèmes suivis, ce que la Banque veut en retirer"
              />
            </label>
          )}
          <label className={`field${errField === "porteur" ? " err" : ""}`}>
            Porteur (propriétaire)
            <select
              value={porteurId}
              onChange={(e) => {
                setPorteurId(e.target.value);
                setErrField("");
              }}
            >
              <option value="">Choisir un utilisateur…</option>
              {DEPTS.map((D) => {
                const L = USERS.filter((u) => u.dept === D.id && (!scopeDept || u.dept === scopeDept) && ((profile !== "contrib" && profile !== "gest") || u.id === me.id));
                if (!L.length) return null;
                return (
                  <optgroup label={D.lib} key={D.id}>
                    {L.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nom}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <span className={`fnote${porteurId ? " on" : ""}`}>
              {porteurId ? `Département : ${deptName(userOf(porteurId)?.dept)}` : "L'initiative sera rattachée au département du porteur"}
            </span>
          </label>
          {!isVeille && (
            <label className={`field${errField === "metier" ? " err" : ""}`}>
              Responsable métier
              <DirectoryUserField
                value={metier}
                onChange={(name) => {
                  setMetier(name);
                  setErrField("");
                  if (!benefTouched) setBenef(name);
                }}
                placeholder="Rechercher dans l'annuaire Office 365…"
              />
            </label>
          )}
          {needsBenef && (
            <label className={`field${errField === "benef" ? " err" : ""}`}>
              Responsable bénéfice
              <DirectoryUserField
                value={benef}
                onChange={(name) => {
                  setBenef(name);
                  setBenefTouched(!!name);
                  setErrField("");
                }}
                placeholder="Rechercher dans l'annuaire Office 365…"
              />
            </label>
          )}
          {((type === "projet" && it) || type === "maintenance") && (
            <label className={`field${errField === "resIT" ? " err" : ""}`}>
              Responsable IT
              <select
                value={resIT}
                onChange={(e) => {
                  setResIT(e.target.value);
                  setErrField("");
                }}
              >
                <option value="">Choisir un responsable IT…</option>
                {resIT && !USERS.some((u) => u.nom === resIT) && <option value={resIT}>{resIT} (valeur actuelle)</option>}
                {USERS.map((u) => <option key={u.id} value={u.nom}>{u.nom} · {deptName(u.dept)}</option>)}
              </select>
            </label>
          )}
          {isVeille && (
            <label className="field">
              Participants
              <select multiple value={part ? part.split(", ").filter(Boolean) : []} onChange={(e) => setPart(Array.from(e.target.selectedOptions, (option) => option.value).join(", "))}>
                {USERS.map((u) => <option key={u.id} value={u.nom}>{u.nom} · {deptName(u.dept)}</option>)}
              </select>
              <span className="fnote">Maintenez Ctrl ou Cmd pour sélectionner plusieurs participants.</span>
            </label>
          )}
          {(!isEdit || isVeille) && (
            <label className="field">
              {isVeille ? "Date de début" : "Date de démarrage"}
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          )}
          {isVeille && (
            <label className={`field${errField === "vfin" ? " err" : ""}`}>
              Date de fin
              <input
                type="date"
                value={vfin}
                onChange={(e) => {
                  setVfin(e.target.value);
                  setErrField("");
                }}
              />
            </label>
          )}
          <label className={`field${errField === "bv" ? " err" : ""}`}>
            Budget validé (XAF)
            <input
              type="text"
              inputMode="numeric"
              value={bv}
              onChange={(e) => {
                setBv(e.target.value);
                setErrField("");
              }}
              placeholder="Ex. 15 000 000"
            />
            {isEdit && <span className="fnote">Une hausse ou une baisse est soumise au Directeur.</span>}
          </label>
        </div>

        {needsBenef && (
          <div className="cben">
            <div className="clo-h">
              <b>Bénéfices attendus</b>
              <span className="sub">Mesurés à la clôture du projet</span>
            </div>
            <div id="c-bens-list">
              {bens.map((b, k) => (
                <div className="cben-item" key={k}>
                  <span>
                    <b>{b.lib}</b>{" "}
                    <span className="m">
                      {numv(b.dep) != null ? `départ ${fmtN(b.dep)} → ` : ""}cible {numv(b.cib) != null ? `${fmtN(b.cib)} ${b.unit}` : "à préciser"}
                    </span>
                  </span>
                  <button type="button" className="btn-ghost sm" onClick={() => setBens((arr) => arr.filter((_, idx) => idx !== k))}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
            <div className="cben-grid">
              <label className="field">
                Bénéfice attendu
                <input type="text" maxLength={160} value={benLib} onChange={(e) => setBenLib(e.target.value)} placeholder="Ex. Réduction du temps d'attente en agence" />
              </label>
              <label className="field">
                Départ
                <input type="text" inputMode="decimal" value={benDep} onChange={(e) => setBenDep(e.target.value)} placeholder="Facultatif" />
              </label>
              <label className="field">
                Cible
                <input type="text" inputMode="decimal" value={benCib} onChange={(e) => setBenCib(e.target.value)} placeholder="Ex. 15" />
              </label>
              <label className="field">
                Unité
                <input type="text" maxLength={30} value={benUnit} onChange={(e) => setBenUnit(e.target.value)} placeholder="min, %, clients" />
              </label>
              <button type="button" className="btn-ghost" onClick={addBen}>
                + Ajouter
              </button>
            </div>
            <p className="hint">Facultatif à la création : vous pourrez compléter ou modifier les bénéfices plus tard.</p>
          </div>
        )}
      </div>

      {(
        <div className="panel">
          <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <h2>Planning prévisionnel · {TEMPLATES[key].label}</h2>
            <p className="sub">{stepLabel}</p>
          </div>
          <div className="plan-sum">
            <div>
              <span>Étapes</span>
              <b>{sch.length}</b>
            </div>
            <div>
              <span>Démarrage</span>
              <b>{fmtY(first.start)}</b>
            </div>
            <div>
              <span>Fin prévisionnelle</span>
              <b>{fmtY(last.end)}</b>
            </div>
            <div>
              <span>Durée</span>
              <b>
                {workDays} j. ouvrés · {workDays <= 60 ? `${Math.round(workDays / 5)} semaine(s)` : `${Math.round(tot / 30.4)} mois`}
              </b>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="steps">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Étape</th>
                  <th>Durée (j. ouvrés)</th>
                  <th>Début</th>
                  <th>Échéance</th>
                  <th>Justificatif attendu</th>
                  <th>Document</th>
                  <th style={{ minWidth: 180 }}>Calendrier</th>
                </tr>
              </thead>
              <tbody>
                {sch.map((s, k) => {
                  const l = (days(d(first.start), d(s.start)) / tot) * 100;
                  const w = Math.max(1.2, ((days(d(s.start), d(s.end)) + 1) / tot) * 100);
                  const isExtra = s.tk >= EXTRA_TK_BASE;
                  return (
                    <tr key={s.tk}>
                      <td className="k">{String(k + 1).padStart(2, "0")}</td>
                      <td>
                        <span className="stepname">
                          <b>
                            {s.t}
                            {s.it && <span className="ittag">IT</span>}
                            {isExtra && <span className="ittag">Ajoutée</span>}
                          </b>
                          {isExtra ? (
                            <button
                              type="button"
                              className="xbtn"
                              title="Retirer cette étape"
                              onClick={() => setExtraSteps((prev) => prev.filter((_, idx) => idx !== s.tk - EXTRA_TK_BASE))}
                            >
                              ×
                            </button>
                          ) : (
                            canSkip && (
                              <button
                                type="button"
                                className="xbtn"
                                title="Retirer cette étape"
                                onClick={() => {
                                  if (TEMPLATES[key].steps.length - skip.size <= 2) {
                                    toast("Un projet doit garder au moins deux étapes");
                                    return;
                                  }
                                  const existing = initial?.jalons.find((jalon) => jalon.t === s.t);
                                  if (existing?.st === "valide") {
                                    toast("Une étape déjà clôturée ne peut pas être retirée");
                                    return;
                                  }
                                  setSkip((prev) => new Set(prev).add(s.tk));
                                }}
                              >
                                ×
                              </button>
                            )
                          )}
                        </span>
                      </td>
                      <td className="dur">
                        <input
                          type="number"
                          min={1}
                          max={250}
                          value={isExtra ? s.dur : durs[s.tk] ?? s.dur}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10) || 1;
                            if (isExtra) {
                              const idx = s.tk - EXTRA_TK_BASE;
                              setExtraSteps((prev) => prev.map((x, i) => (i === idx ? { ...x, dur: v } : x)));
                              return;
                            }
                            setDurs((prev) => {
                              const copy = [...prev];
                              copy[s.tk] = v;
                              return copy;
                            });
                          }}
                        />
                      </td>
                      <td className="dt">{fmt(s.start)}</td>
                      <td className="dt">
                        <b>{fmtY(s.end)}</b>
                      </td>
                      <td className="rq">{s.req}</td>
                      <td>
                        <div className="cdoc">
                          {(files[s.tk] || []).map((f, fi) => (
                            <span className="fn" title={f.name} key={fi}>
                              ✓ {f.name}
                            </span>
                          ))}
                          <label className="upl sm">
                            + Importer
                            <input type="file" multiple style={{ display: "none" }} onChange={(e) => handleStepFiles(s.tk, e.target.files)} />
                          </label>
                        </div>
                      </td>
                      <td>
                        <div className="trk">
                          <i className={k === sch.length - 1 ? "last" : ""} style={{ left: `${Math.min(l, 98.8)}%`, width: `${Math.min(w, 100 - l)}%` }}></i>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canSkip && skip.size > 0 && (
            <div className="skipped">
              <span>Étapes retirées :</span>
              {[...skip].sort((a, b) => a - b).map((k) => (
                <span className="sk" key={k}>
                  {TEMPLATES[key].steps[k].t}
                  <button type="button" className="btn-ghost sm" onClick={() => setSkip((prev) => { const copy = new Set(prev); copy.delete(k); return copy; })}>
                    Rétablir
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="addj">
            {!addStepOpen ? (
              <button type="button" className="btn-ghost" onClick={() => setAddStepOpen(true)}>
                + Ajouter une étape
              </button>
            ) : (
              <div className="addj-form">
                <b>Nouvelle étape</b>
                <label className="field" htmlFor="c-add-t">
                  Intitulé
                  <input id="c-add-t" value={newStepT} onChange={(e) => setNewStepT(e.target.value)} maxLength={120} placeholder="Ex. Validation par le Comité de direction" />
                </label>
                <div className="addj-grid">
                  <label className="field" htmlFor="c-add-dur">
                    Durée (j. ouvrés)
                    <input id="c-add-dur" type="number" min={1} max={250} value={newStepDur} onChange={(e) => setNewStepDur(e.target.value)} />
                  </label>
                  <label className="field" htmlFor="c-add-req">
                    Justificatif attendu
                    <input id="c-add-req" value={newStepReq} onChange={(e) => setNewStepReq(e.target.value)} maxLength={120} placeholder="Ex. Compte rendu du Comité" />
                  </label>
                </div>
                <div className="clo-act">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setAddStepOpen(false);
                      setNewStepT("");
                      setNewStepDur("10");
                      setNewStepReq("");
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!newStepT.trim()}
                    onClick={() => {
                      setExtraSteps((prev) => [
                        ...prev,
                        { t: newStepT.trim(), dur: Math.max(1, Math.min(250, parseInt(newStepDur, 10) || 1)), req: newStepReq.trim() || "Justificatif de l'étape" },
                      ]);
                      setNewStepT("");
                      setNewStepDur("10");
                      setNewStepReq("");
                      setAddStepOpen(false);
                    }}
                  >
                    Ajouter l'étape
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="create-foot">
            <p className={`hint${hintErr ? " err" : ""}`}>{hint}</p>
            {isEdit && <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>}
            <button className="btn red" onClick={isEdit ? handleSaveEdit : handleCreate}>
              {isEdit ? "Enregistrer les modifications" : "Créer et lancer le suivi"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
