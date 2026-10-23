import { useStore } from "../state/store";

export default function Toast() {
  const { toastMsg, toastKind } = useStore();
  return (
    <div className={`toast${toastKind === "error" ? " toast-error" : ""}`} role={toastKind === "error" ? "alert" : "status"} hidden={!toastMsg}>
      {toastMsg}
    </div>
  );
}
