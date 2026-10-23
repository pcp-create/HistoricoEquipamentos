"use client";
import { useEffect, useState } from "react";
export default function VisitAutomationSettings() {
  const [users, setUsers] = useState<{ email: string; display_name: string }[]>(
      [],
    ),
    [value, setValue] = useState(""),
    [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/visits/settings", { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setUsers(b.users || []);
        setValue(b.equipmentAssignee || "");
        setSaved(b.equipmentAssignee || "");
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="sales-panel">
      <h2>Tarefas automáticas</h2>
      <p>
        Responsável por receber as solicitações de cadastro de máquinas
        registradas nas visitas.
      </p>
      <label>
        Responsável pelo cadastro de equipamentos
        <select
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage("");
          }}
        >
          <option value="">Selecione o responsável</option>
          {users.map((u) => (
            <option key={u.email} value={u.email}>
              {u.display_name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !value || value === saved}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/visits/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "equipmentAssignee",
                  equipmentAssignee: value,
                }),
              }),
              b = await r.json();
            if (!r.ok) throw Error(b.error);
            setSaved(value);
            setMessage("Responsável atualizado.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Salvando…" : "Salvar responsável"}
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
