import InitiativeForm from "../components/InitiativeForm";
import type { Initiative } from "../data/types";

type Props =
  | { initiative: Initiative; onSubmit: (patch: Partial<Initiative>) => void; onCancel: () => void; onCreated?: never }
  | { initiative?: never; onSubmit?: never; onCancel?: never; onCreated: () => void };

export default function CreatePage(props: Props) {
  if (props.initiative) {
    return <InitiativeForm mode="edit" initial={props.initiative} onSubmit={props.onSubmit} onCancel={props.onCancel} />;
  }
  return <InitiativeForm mode="create" onCreated={props.onCreated} />;
}
