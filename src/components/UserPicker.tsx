import { useEffect, useRef, useState } from "react";
import { searchDirectoryUsers, type DirectoryUser } from "../lib/identity";

/** Recherche-sélection d'un compte dans l'annuaire d'entreprise (Office 365 / Microsoft Graph). */
export default function UserPicker({
  onPick,
  excludeEmails,
}: {
  onPick: (u: DirectoryUser) => void;
  excludeEmails: string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      searchDirectoryUsers(q).then((list) => {
        if (seq.current !== mySeq) return;
        setResults(list.filter((u) => !excludeEmails.includes(u.mail.toLowerCase())));
        setOpen(true);
        setLoading(false);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, excludeEmails]);

  function pick(u: DirectoryUser) {
    onPick(u);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="cbx">
      <input
        className="cbx-in"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Nom ou e-mail dans l'annuaire Office 365…"
        aria-label="Rechercher un utilisateur dans l'annuaire Office 365"
      />
      {open && (
        <ul className="cbx-l">
          {loading && <li className="cbx-none">Recherche…</li>}
          {!loading && results.length === 0 && <li className="cbx-none">Aucun résultat</li>}
          {!loading &&
            results.map((u) => (
              <li key={u.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(u)}>
                <b>{u.displayName}</b> <span className="n">{u.mail}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
