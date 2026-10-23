"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Wrench } from "lucide-react";
export default function VisitMachineRegistration({
  customer,
  name,
  online,
}: {
  customer: string;
  name: string;
  online: boolean;
}) {
  const [machines, setMachines] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
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
    load().catch((e) => setError(e.message));
  }, [customer]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="sales-machine-create"
        disabled={!online || busy}
        onClick={() => {
          request.current = crypto.randomUUID();
          setError("");
          setMessage("");
          setOpen(true);
        }}
      >
        <span className="sales-machine-create-icon" aria-hidden="true"><Wrench size={18} /></span>
        <span>Cadastrar máquina</span>
        <Plus size={17} aria-hidden="true" />
      </button>
      {message && <p role="status">{message}</p>}
      {error && !open && <p role="alert">{error}</p>}
      {machines.length > 0 && (
        <p>
          <strong>Máquinas aguardando cadastro ({machines.length})</strong>
        </p>
      )}
      {machines.map((m) => (
        <article key={m.id}>
          <strong>
            {m.equipment_type} - {m.model}
          </strong>
          <p>
            Marca: {m.brand} · Série: {m.serial}
          </p>
          <p>Horímetro: {Number(m.meter).toLocaleString("pt-BR")} h</p>
          <small>Cadastro pendente</small> ·{" "}
          <a href={"/tarefas?task=" + m.task_id}>Tarefa TAR-{m.task_id}</a>
        </article>
      ))}
      {open && (
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
            As informações serão salvas e uma tarefa será enviada ao responsável
            pelo cadastro. Você acompanhará essa tarefa.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              setError("");
              try {
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
            <button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar e gerar tarefa"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </form>
        </dialog>
      )}
    </>
  );
}
