"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DraftMachine } from "@/lib/visits/draft-machines";
import { Plus, Wrench } from "lucide-react";
export default function VisitMachineRegistration({
  customer,
  name,
  online,
  renderVisitRecord,
  draftMachines,
  onDraftMachines,
}: {
  customer: string;
  name: string;
  online: boolean;
  draftMachines?: DraftMachine[];
  onDraftMachines?: (machines: DraftMachine[]) => void;
  renderVisitRecord?: (machine: { id: string; model: string }) => ReactNode;
}) {
  const [machines, setMachines] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const drafting = !!onDraftMachines;
  const displayedMachines = drafting
    ? (draftMachines || []).map((m) => ({
        id: m.requestId,
        equipment_type: m.equipmentType,
        model: m.model,
        brand: m.brand,
        serial: m.serial,
        meter: m.meter,
        observations: m.observations,
        task_id: null,
      }))
    : machines;
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef("");
  async function load() {
    const r = await fetch(
      "/api/visits/machines?customer=" + encodeURIComponent(customer),
      { cache: "no-store" },
    );
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setMachines(b.machines);
  }
  useEffect(() => {
    if (!drafting) load().catch((e) => setError(e.message));
  }, [customer, drafting]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      {message && <p role="status">{message}</p>}
      {error && !open && <p role="alert">{error}</p>}
      {displayedMachines.length > 0 && (
        <p>
          <strong>
            {drafting
              ? "Máquinas incluídas no novo Lead"
              : "Máquinas aguardando cadastro"}{" "}
            ({displayedMachines.length})
          </strong>
        </p>
      )}
      {displayedMachines.map((m) => (
        <article key={m.id}>
          <strong>
            {m.equipment_type} - {m.model}
          </strong>
          <p>
            Marca: {m.brand} · Série: {m.serial}
          </p>
          <p>Horímetro: {Number(m.meter).toLocaleString("pt-BR")} h</p>
          {m.observations && (
            <p style={{ whiteSpace: "pre-wrap" }}>
              <strong>Observações:</strong> {m.observations}
            </p>
          )}
          {drafting ? (
            <>
              <small>Será salva junto com o Lead e a visita.</small>
              <button
                type="button"
                disabled={busy || !online}
                onClick={() =>
                  onDraftMachines?.(
                    (draftMachines || []).filter(
                      (item) => item.requestId !== m.id,
                    ),
                  )
                }
              >
                Remover máquina {m.model}
              </button>
            </>
          ) : (
            <>
              <small>Cadastro pendente</small> ·{" "}
              <a href={"/tarefas?task=" + m.task_id}>Tarefa TAR-{m.task_id}</a>
            </>
          )}
          {renderVisitRecord?.(m)}
        </article>
      ))}
      <button
        type="button"
        className="sales-machine-create"
        disabled={
          !online || busy || (drafting && (draftMachines?.length || 0) >= 20)
        }
        onClick={() => {
          request.current = crypto.randomUUID();
          setError("");
          setMessage("");
          setOpen(true);
        }}
      >
        <span className="sales-machine-create-icon" aria-hidden="true">
          <Wrench size={18} />
        </span>
        <span>Cadastrar máquina</span>
        <Plus size={17} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="sales-dialog visit-task-dialog"
            aria-label="Cadastrar máquina"
            onCancel={(e) => {
              if (busy) e.preventDefault();
              else setOpen(false);
            }}
          >
            <h2>Cadastrar máquina</h2>
            <p>{name}</p>
            <p>
              {drafting
                ? "Adicione a máquina ao novo Lead. As informações e a tarefa de cadastro serão salvas ao confirmar a visita."
                : "As informações serão salvas e uma tarefa será enviada ao responsável pelo cadastro. Você acompanhará essa tarefa."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const values = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                setBusy(true);
                setError("");
                try {
                  if (drafting) {
                    onDraftMachines?.([
                      ...(draftMachines || []),
                      { ...values, requestId: request.current } as DraftMachine,
                    ]);
                    setOpen(false);
                    setMessage(
                      "Máquina incluída no Lead. Confirme a visita para salvar.",
                    );
                    return;
                  }
                  const r = await fetch("/api/visits/machines", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...values,
                        customer,
                        requestId: request.current,
                      }),
                    }),
                    b = await r.json();
                  if (!r.ok) throw Error(b.error);
                  setOpen(false);
                  setMessage(
                    "Máquina registrada. Tarefa TAR-" +
                      b.taskId +
                      " criada para cadastro.",
                  );
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {error && <p role="alert">{error}</p>}
              {(
                [
                  ["equipmentType", "Tipo de equipamento"],
                  ["model", "Modelo"],
                  ["brand", "Marca"],
                  ["serial", "Número de série"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input name={key} required maxLength={200} disabled={busy} />
                </label>
              ))}
              <label>
                Horímetro (h)
                <input
                  required
                  name="meter"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  disabled={busy}
                />
              </label>
              <label>
                Observações
                <textarea
                  name="observations"
                  rows={3}
                  maxLength={2000}
                  disabled={busy}
                  placeholder="Informações adicionais sobre a máquina (opcional)"
                />
              </label>
              <div className="visit-machine-actions">
                <button type="submit" disabled={busy}>
                  {busy
                    ? "Salvando…"
                    : drafting
                      ? "Adicionar ao Lead"
                      : "Salvar e gerar tarefa"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
