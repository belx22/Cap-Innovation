import { useState, type ReactNode } from "react";

/** Filtre en saisie libre : recherche en direct parmi les options existantes, sélection ou correspondance exacte. */
export default function FilterCombobox({
  value,
  onChange,
  options,
  allLabel = "Tous",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  allLabel?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find(([v]) => v === value)?.[1] || "";
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(([, label]) => label.toLowerCase().includes(q)) : options;

  function pick(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  function highlight(label: string): ReactNode {
    if (!q) return label;
    const idx = label.toLowerCase().indexOf(q);
    if (idx < 0) return label;
    return (
      <>
        {label.slice(0, idx)}
        <mark>{label.slice(idx, idx + q.length)}</mark>
        {label.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div className="cbx in-fb">
      <input
        className="cbx-in"
        value={open ? query : selectedLabel}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || allLabel}
      />
      <button type="button" className="cbx-x" hidden={!value} title="Effacer" onMouseDown={(e) => e.preventDefault()} onClick={() => pick("")}>
        ×
      </button>
      {open && (
        <ul className="cbx-l">
          <li className="cbx-all" onMouseDown={(e) => e.preventDefault()} onClick={() => pick("")}>
            {allLabel}
          </li>
          {filtered.length === 0 && <li className="cbx-none">Aucun résultat</li>}
          {filtered.map(([v, label]) => (
            <li key={v} className={v === value ? "cbx-sel" : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(v)}>
              {highlight(label)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
