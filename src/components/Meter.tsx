import { tCls } from "../lib/domain";

export default function Meter({ value }: { value: number }) {
  const cls = tCls(value);
  return (
    <div className="meter-row">
      <div className={`meter ${cls}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }}></i>
      </div>
      <b className={cls}>{value} %</b>
    </div>
  );
}
