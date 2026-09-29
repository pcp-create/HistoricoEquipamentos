"use client";
import { useState } from "react";
export default function TimeRequestApproval({ task, onChanged }: any) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/field/time-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: task.source_key.split(":")[1],
          reason,
        }),
      });
      const b = await res.json();
      if (!res.ok) throw Error(b.error);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (task.status === "completed")
    return (
      <p>Solicitação analisada. Consulte o resultado nas notas da tarefa.</p>
    );
  return (
    <div>
      <p>
        Confira o motivo e os horários solicitados nas notas abaixo. Somente um
        dos gestores cadastrados pode aprovar.
      </p>
      <button disabled={busy} onClick={() => void act("approve")}>
        Aprovar Solicitação
      </button>
      <details>
        <summary>Rejeitar solicitação</summary>
        <label>
          Motivo da rejeição
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
          />
        </label>
        <button
          disabled={busy || !reason.trim()}
          onClick={() => void act("reject")}
        >
          Rejeitar Solicitação
        </button>
      </details>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
