import type { Initiative, Jalon } from "../data/types";
import { LBL } from "../data/templates";
import { TODAY, d, days, iso } from "./dates";
import { deptName, pilOf, progOf, refLbl } from "../data/reference";
import { fmtXAF, health, numv, phaseLbl, prog, typeLbl } from "./domain";
import { afterDay, ensureDurs } from "./planning";

/**
 * Générateur OOXML (.xlsx) fait main, port fidèle du prototype (aucune dépendance npm :
 * un classeur minimal n'a besoin que d'un zip non compressé + quelques XML statiques).
 */

function stripControlChars(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const isControl = code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31);
    if (!isControl) out += s[i];
  }
  return out;
}

const XE = (t: unknown): string =>
  stripControlChars(
    String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
  );

const colL = (n: number): string => {
  let s = "";
  n++;
  while (n) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const CRCT = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zipStore(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const cd: Uint8Array[] = [];
  let off = 0;
  files.forEach((f) => {
    const nm = enc.encode(f.name);
    const data = enc.encode(f.data);
    const c = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(10, 0, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, c, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(14, 33, true);
    e.setUint32(16, c, true);
    e.setUint32(20, data.length, true);
    e.setUint32(24, data.length, true);
    e.setUint16(28, nm.length, true);
    e.setUint32(42, off, true);
    cd.push(new Uint8Array(e.buffer), nm);
    off += 30 + nm.length + data.length;
  });
  const cdl = cd.reduce((a, x) => a + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdl, true);
  end.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(end.buffer)] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// styles : 1 en-tête, 2 titre, 3 cellule, 4 retard, 5 avance/à temps, 6 en attente, 7 barre prévue,
// 8 barre retard, 9 barre réalisée, 10 libellé, 11 gras, 12 centré, 13 jour J
const XSTY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1A1A1A"/><name val="Calibri"/></font></fonts>
<fills count="11"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${["1A1A1A", "F8D7DA", "D4EDDA", "FFF3CD", "A9B8D0", "C0392B", "2E8B57", "EEF1F5", "C8102E"]
  .map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)
  .join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">${[
  [0, 0, 0, ""],
  [2, 2, 1, "center"],
  [3, 0, 0, ""],
  [0, 0, 1, ""],
  [0, 3, 1, ""],
  [0, 4, 1, ""],
  [0, 5, 1, ""],
  [0, 6, 1, ""],
  [0, 7, 1, ""],
  [0, 8, 1, ""],
  [1, 9, 1, ""],
  [1, 0, 0, ""],
  [0, 0, 1, "center"],
  [2, 10, 1, "center"],
]
  .map(
    ([f, fi, b, h]) =>
      `<xf numFmtId="0" fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"${h ? ` horizontal="${h}"` : ""}/></xf>`
  )
  .join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

type CellObj = { v: string | number; s?: number };
type Cell = CellObj | string | number | null;

interface Sheet {
  name: string;
  rows: Cell[][];
  merges?: string[];
  heights?: number[];
  freeze?: number;
  freezeCol?: number;
  cols: number[];
}

function sheetXML(sh: Sheet): string {
  const rows = sh.rows
    .map((r, ri) => {
      const cells = r
        .map((c, ci) => {
          if (c == null) return "";
          const o: CellObj = typeof c === "object" ? c : { v: c };
          const ref = colL(ci) + (ri + 1);
          const st = o.s ? ` s="${o.s}"` : "";
          if (o.v === "" || o.v == null) return `<c r="${ref}"${st}/>`;
          return typeof o.v === "number"
            ? `<c r="${ref}"${st}><v>${o.v}</v></c>`
            : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${XE(o.v)}</t></is></c>`;
        })
        .join("");
      const ht = sh.heights && sh.heights[ri] ? ` ht="${sh.heights[ri]}" customHeight="1"` : "";
      return `<row r="${ri + 1}"${ht}>${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    (sh.freeze
      ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sh.freezeCol || 0}" ySplit="${sh.freeze}" topLeftCell="${colL(sh.freezeCol || 0)}${sh.freeze + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
      : "") +
    `<sheetFormatPr defaultRowHeight="15"/><cols>${sh.cols.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rows}</sheetData>` +
    (sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "") +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
  );
}

function xlsxBlob(sheets: Sheet[]): Blob {
  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_x, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((x, k) => `<sheet name="${XE(x.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31))}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_x, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: XSTY },
  ];
  sheets.forEach((x, k) => files.push({ name: `xl/worksheets/sheet${k + 1}.xml`, data: sheetXML(x) }));
  return zipStore(files);
}

function saveBlob(name: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

const dFR = (s?: string): string => (s ? d(s).toLocaleDateString("fr-FR") : "");

interface StepRowCalc {
  k: number;
  j: Jalon;
  start: string;
  end: string;
  ecart: number | null;
  sit: string;
  sty: number;
}

function stepRows(i: Initiative): StepRowCalc[] {
  ensureDurs(i);
  const T = iso(TODAY);
  let prev: string | null = null;
  return i.jalons.map((j, k) => {
    const st = k ? iso(afterDay(prev!)) : i.deb || i.start || j.due;
    const start = st > j.due ? j.due : st;
    prev = j.due;
    let ecart: number | null = null;
    let sit: string;
    let sty: number;
    if (j.st === "valide") {
      ecart = days(d(j.due), d(j.fin || j.due));
      sit = ecart > 0 ? `Clôturée avec ${ecart} j de retard` : ecart < 0 ? `Clôturée avec ${-ecart} j d'avance` : "Clôturée à la date prévue";
      sty = ecart > 0 ? 4 : 5;
    } else if (j.due < T) {
      ecart = days(d(j.due), TODAY);
      sit = `En retard de ${ecart} j`;
      sty = 4;
    } else {
      const r = days(TODAY, d(j.due));
      sit = j.st === "a_valider" ? `À valider · échéance dans ${r} j` : j.st === "complement" ? `Complément demandé · échéance dans ${r} j` : `À venir · échéance dans ${r} j`;
      sty = j.st === "a_valider" || j.st === "complement" ? 6 : 3;
    }
    return { k, j, start, end: j.st === "valide" ? j.fin || j.due : j.due < T ? T : j.due, ecart, sit, sty };
  });
}

function mondayOf(x: Date): Date {
  const y = new Date(x);
  const w = (y.getDay() + 6) % 7;
  y.setDate(y.getDate() - w);
  return y;
}

function planSheetOne(i: Initiative): Sheet {
  const R = stepRows(i);
  const T = iso(TODAY);
  const h = health(i);
  const endRef = i.jalons[i.jalons.length - 1].due;
  const lastEnd = R.reduce((m, x) => (x.end > m ? x.end : m), "");
  const late = R.filter((x) => x.sty === 4);
  const first = R.reduce((m, x) => (x.start < m ? x.start : m), R[0].start);
  const weeks: string[] = [];
  for (let w = mondayOf(d(first)); iso(w) <= (lastEnd > T ? lastEnd : T); w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7, 12)) weeks.push(iso(w));
  const NC = 12;
  const head = ["N°", "Étape", "Début prévu", "Échéance", "Fin réelle", "Statut", "Écart (j)", "Situation", "Justificatif attendu", "Pièces déposées", "Difficultés", "Commentaires"];
  const rows: Cell[][] = [];
  const merges: string[] = [];
  const heights: number[] = [];
  rows.push([{ v: `Planning détaillé · ${i.code} · ${i.titre}`, s: 2 }]);
  merges.push(`A1:${colL(NC - 1)}1`);
  heights[0] = 24;
  const info: [string, string, string, string][] = [
    ["Type", typeLbl(i), "Porteur", `${i.porteur}${i.dept ? ` (${deptName(i.dept)})` : ""}`],
    ["Phase", phaseLbl(i), "Responsable métier", i.metier || ""],
    ["Avancement", `${prog(i)} % (${i.jalons.filter((j) => j.st === "valide").length} / ${i.jalons.length} étapes clôturées)`, "État de santé", h[1]],
    ["Fin prévisionnelle", dFR(endRef), "Étapes en retard", `${late.length}${late.length ? ` · retard maximal ${Math.max(...late.map((x) => x.ecart!))} j` : ""}`],
    ["Pilier", refLbl(pilOf(i.pil)), "Programme", refLbl(progOf(i.prog))],
    ["Budget", numv(i.bv) ? `${fmtXAF(i.bc)} consommés sur ${fmtXAF(i.bv)}` : "Non renseigné", "Édité le", `${dFR(T)} par Cap Innovation`],
  ];
  info
    .flatMap(([a, b, c, e]) => [
      [a, b],
      [c, e],
    ])
    .forEach(([a, b]) => {
      const r = rows.length + 1;
      rows.push([{ v: a, s: 10 }, null, { v: b, s: 3 }, null, null, null, null, null]);
      merges.push(`A${r}:B${r}`, `C${r}:H${r}`);
    });
  rows.push([]);
  const hr = rows.length;
  rows.push([
    ...head.map((v) => ({ v, s: 1 })),
    ...weeks.map((w) => {
      const we = iso(new Date(d(w).getFullYear(), d(w).getMonth(), d(w).getDate() + 6, 12));
      const isToday = w <= T && we >= T;
      return { v: isToday ? "Auj." : dFR(w).slice(0, 5), s: isToday ? 13 : 1 };
    }),
  ]);
  R.forEach((x) => {
    const j = x.j;
    rows.push([
      { v: x.k + 1, s: 12 },
      { v: j.t, s: 3 },
      { v: dFR(x.start), s: 12 },
      { v: dFR(j.due), s: 12 },
      { v: dFR(j.fin), s: 12 },
      { v: LBL[j.st], s: x.sty },
      { v: x.ecart == null ? "" : x.ecart, s: x.sty === 4 ? 4 : x.ecart != null && x.ecart < 0 ? 5 : 12 },
      { v: x.sit, s: x.sty },
      { v: j.req, s: 3 },
      { v: j.f.map((f) => f.n).join(", "), s: 3 },
      { v: j.difs.map((z) => `${dFR(z.at)} : ${z.txt}`).join(" | "), s: j.difs.length ? 6 : 3 },
      { v: (j.coms || []).map((z) => `${dFR(z.at)} : ${z.txt}`).join(" | "), s: 3 },
      ...weeks.map((w) => {
        const we = iso(new Date(d(w).getFullYear(), d(w).getMonth(), d(w).getDate() + 6, 12));
        const inPlan = x.start <= we && j.due >= w;
        const inLate = x.end > j.due && w <= x.end && we > j.due;
        return { v: "", s: inLate ? 8 : inPlan ? (j.st === "valide" ? 9 : 7) : 0 };
      }),
    ]);
  });
  rows.push([]);
  rows.push([{ v: "Légende : barre bleue = période prévue ; verte = étape clôturée ; rouge = retard (au-delà de l'échéance, jusqu'à la fin réelle ou à aujourd'hui). Écart positif = retard en jours, négatif = avance.", s: 0 }]);
  merges.push(`A${rows.length}:${colL(NC - 1)}${rows.length}`);
  return {
    name: `Planning ${i.code}`,
    rows,
    merges,
    heights,
    freeze: hr + 1,
    freezeCol: 2,
    cols: [5, 34, 11, 11, 11, 13, 9, 28, 24, 22, 30, 30, ...weeks.map(() => 5.5)],
  };
}

/** Télécharge le planning détaillé (.xlsx) d'une initiative, format identique au prototype. */
export function downloadPlan(i: Initiative): void {
  saveBlob(`Planning_${i.code}_${iso(TODAY)}.xlsx`, xlsxBlob([planSheetOne(i)]));
}
