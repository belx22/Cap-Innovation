import { useState } from "react";
import UserPicker from "./UserPicker";
import type { DirectoryUser } from "../lib/identity";

/** Champ "responsable" dont la valeur vient obligatoirement de l'annuaire Office 365, pas du référentiel applicatif. */
export default function DirectoryUserField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  function pick(u: DirectoryUser) {
    onChange(u.displayName);
    setEditing(false);
  }

  if (!editing && value) {
    return (
      <span className="duf-val">
        {value}
        <button type="button" className="linkish" onClick={() => setEditing(true)}>
          Modifier
        </button>
      </span>
    );
  }

  return (
    <>
      <UserPicker onPick={pick} excludeEmails={[]} />
      {!value && placeholder && <span className="fnote">{placeholder}</span>}
    </>
  );
}
