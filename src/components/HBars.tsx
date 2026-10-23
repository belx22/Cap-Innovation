export interface HBarRow {
  l: string;
  v: number;
  cls?: string;
}

export default function HBars({ rows, fmtv, max }: { rows: HBarRow[]; fmtv?: (v: number) => string; max?: number }) {
  const m = max || Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="hb">
      {rows.map((r) => (
        <div className="hb-r" key={r.l} title={`${r.l} : ${fmtv ? fmtv(r.v) : r.v}`}>
          <span className="hb-l">{r.l}</span>
          <span className="hb-t">
            <i className={r.cls || ""} style={{ width: `${Math.max(r.v ? 2 : 0, (100 * r.v) / m)}%` }}></i>
          </span>
          <span className="hb-v">{fmtv ? fmtv(r.v) : r.v}</span>
        </div>
      ))}
    </div>
  );
}
