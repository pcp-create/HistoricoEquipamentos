"use client";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
function local(value?: string) {
  if (!value) return "";
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return p.replace(" ", "T");
}
async function gps(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(
        Error("Permita a localização para registrar a solicitação."),
      );
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          at: new Date(p.timestamp).toISOString(),
        }),
      () =>
        reject(Error("Permita a localização para registrar a solicitação.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  });
}
export default function TimeAdjustmentForm({
  row,
  operations,
  planner = false,
  onClose,
  onSaved,
}: any) {
  const dialog = useRef<HTMLDialogElement>(null),
    requestId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [operation, setOperation] = useState(row?.operation_id || (operations.length === 1 ? operations[0].id : "")),
    [kind, setKind] = useState(row?.kind || "work"),
    [start, setStart] = useState(local(row?.started_at)),
    [end, setEnd] = useState(local(row?.finished_at)),
    [reason, setReason] = useState(""),
    [pauses, setPauses] = useState<any[]>(
      (row?.pauses || []).map((p: any) => ({
        ...p,
        start: local(p.start),
        end: local(p.end),
      })),
    );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const convert = (v: string) => {
        if (!v) throw Error("Preencha início e fim.");
        return new Date(v + "-03:00").toISOString();
      };
      const proposed = {
        started_at: convert(start),
        finished_at: convert(end),
        pauses: pauses.map((p) => ({
          ...p,
          start: convert(p.start),
          end: convert(p.end),
        })),
      };
      const location = planner ? undefined : await gps();
      const res = await fetch("/api/field/time-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: planner ? "planner_adjust" : "request",
          requestId: requestId.current,
          sessionId: row?.legacyEventId ? undefined : row?.id,
          legacyEventId: row?.legacyEventId,
          operationId: operation,
          version: row?.correction_version || 0,
          kind,
          proposed,
          reason,
          location,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error);
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="time-adjustment-dialog"
      aria-label={
        planner
          ? "Ajustar apontamento"
          : row
            ? "Solicitar ajuste"
            : "Incluir apontamento manual"
      }
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2>
        {planner
          ? "Ajustar apontamento"
          : row
            ? "Solicitar ajuste"
            : "Incluir apontamento manual"}
      </h2>
      <p>
        {planner
          ? "O ajuste será registrado no histórico."
          : "Aguardará aprovação de um gestor antes de alterar os totais."}{" "}
        Horários de Brasília.
      </p>
      <fieldset disabled={busy}>
        <label>
          Operação
          <select
            aria-label="Operação"
            value={operation}
            disabled={!!row}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="">Selecione</option>
            {operations.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.order_number ? "OS " + o.order_number + " · " : ""}Operação{" "}
                {operationNumber(o.position)} · {o.document.description}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            aria-label="Tipo"
            value={kind}
            disabled={!!row}
            onChange={(e) => {
              setKind(e.target.value);
              setPauses([]);
            }}
          >
            <option value="work">Atividade</option>
            <option value="travel">Deslocamento</option>
          </select>
        </label>
        <label>
          Início
          <input
            type="datetime-local"
            step="1"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Fim
          <input
            type="datetime-local"
            step="1"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        {kind === "work" && (
          <section className="time-adjustment-pauses">
            <h3>Pausas</h3>
            {pauses.map((p, i) => (
              <fieldset key={i}>
                <label>
                  Motivo da pausa
                  <input
                    value={p.reason}
                    maxLength={500}
                    onChange={(e) =>
                      setPauses(
                        pauses.map((v, n) =>
                          n === i ? { ...v, reason: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                {["start", "end"].map((k) => (
                  <label key={k}>
                    {k === "start" ? "Início" : "Fim"} da pausa
                    <input
                      type="datetime-local"
                      step="1"
                      value={p[k]}
                      onChange={(e) =>
                        setPauses(
                          pauses.map((v, n) =>
                            n === i ? { ...v, [k]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className="time-adjustment-remove"
                  onClick={() => setPauses(pauses.filter((_, n) => n !== i))}
                >
                  Remover pausa
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="time-adjustment-add"
              onClick={() =>
                setPauses([...pauses, { start: "", end: "", reason: "" }])
              }
            >
              Adicionar pausa
            </button>
          </section>
        )}
        <label>
          Motivo da solicitação / ajuste
          <textarea
            rows={3}
            placeholder="Descreva o motivo da inclusão ou alteração do apontamento."
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="time-adjustment-actions">
        <button disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          disabled={busy || !operation || !reason.trim() || !start || !end}
          onClick={() => void save()}
        >
          {busy
            ? "Salvando…"
            : planner
              ? "Salvar ajuste"
              : "Solicitar aprovação"}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
