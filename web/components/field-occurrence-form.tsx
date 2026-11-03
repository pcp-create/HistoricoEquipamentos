"use client";
import { useState } from "react";
export default function FieldOccurrenceForm({
  operationId,
  equipment,
  onSaved,
  onCancel,
}: {
  operationId: string;
  equipment: any[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saved) return;
    if (!navigator.onLine) {
      setError(
        "Conecte-se à internet para registrar o B.O. O formulário permanece aberto.",
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/equipment-occurrences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId,
          equipmentId: form.get("equipmentId"),
          occurredOn: form.get("occurredOn"),
          title: form.get("title"),
          description: form.get("description"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível registrar o B.O.");
      setSaved(true);
      try {
        await onSaved();
      } catch {
        setError(
          "B.O registrado. Atualize a operação para consultar o histórico.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível registrar o B.O.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="field-panel">
      <h3>Registrar B.O</h3>
      <p>
        Registre uma particularidade ou ocorrência no histórico do equipamento.
        Ela ficará disponível para os próximos atendimentos.
      </p>
      {error && <p role="alert">{error}</p>}
      {!equipment.length ? (
        <>
          <p>
            Não foi possível identificar um equipamento do cadastro para esta
            OS/operação. Solicite ao planejador a conferência do equipamento
            informado na OS ou na programação para registrar o B.O.
          </p>
          <button onClick={onCancel}>Voltar à operação</button>
        </>
      ) : (
        <form className="field-bo-form" onSubmit={submit}>
          <fieldset disabled={busy || saved}>
            <label>
              Equipamento
              <select
                name="equipmentId"
                required
                defaultValue={equipment[0]?.id}
              >
                {equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · Série {e.serial || "não informada"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data da ocorrência
              <input
                type="date"
                name="occurredOn"
                required
                defaultValue={new Intl.DateTimeFormat("en-CA", {
                  timeZone: "America/Sao_Paulo",
                }).format(new Date())}
              />
            </label>
            <label>
              Título
              <input name="title" required maxLength={160} />
            </label>
            <label>
              Descrição da ocorrência
              <textarea
                name="description"
                required
                maxLength={12000}
                rows={6}
                placeholder="Descreva o ocorrido e as orientações sobre este equipamento."
              />
            </label>
          </fieldset>
          <div className="field-bo-actions">
            <button disabled={busy || saved} type="submit">
              {busy ? "Salvando…" : saved ? "B.O registrado" : "Salvar B.O"}
            </button>
            <button disabled={busy} type="button" onClick={onCancel}>
              {saved ? "Voltar" : "Cancelar"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
