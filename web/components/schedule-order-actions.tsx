"use client";
import OrderSearchSelect from "./order-search-select";
import OrderAttachments,{sendOrderAttachments} from "./order-attachments";
import { useRef, useState } from "react";
import { clearApiCache } from "@/lib/client-api-cache";
async function api(url: string, body?: any) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "Não foi possível concluir.");
  return b;
}
export default function ScheduleOrderActions({
  data,
  onChanged,
}: {
  data: any;
  onChanged: () => void;
}) {
  const [attachmentFiles,setAttachmentFiles]=useState<File[]>([]);
  const [edit, setEdit] = useState<any>(null),
    [flows, setFlows] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [phone, setPhone] = useState(""),
    [customer, setCustomer] = useState(false);
  const editRequest = useRef<string | null>(null),
    delivery = useRef<{ id: string; phone: string } | null>(null);
  const company = String(data.schedule.company_id),
    order = String(data.schedule.order_id);
  const reviewed =
    data.operations?.length > 0 &&
    data.operations.every((o: any) =>
      ["reviewed", "completed"].includes(o.status),
    );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      clearApiCache();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openEdit() {
    await run(async () => {
      const [e, f] = await Promise.all([
        api(
          "/api/service-orders?" +
            new URLSearchParams({ edit: "1", company, order }),
        ),
        api("/api/warehouse?flowStatuses=1"),
      ]);
      setAttachmentFiles([]);
      setEdit(e);
      setFlows(f.rows);
      editRequest.current = null;
    });
  }
  async function saveHeader() {
    await run(async () => {
      const id =
        editRequest.current || (editRequest.current = crypto.randomUUID());
      await api("/api/service-orders", {
        action: "edit-prepare",
        id,
        company,
        order,
        version: edit.version,
        draft: edit.draft,
      });
      let result;
      for (let i = 0; i < 3; i++) {
        result = await api("/api/service-orders", {
          action: "edit-advance",
          id,
        });
        if (result.state !== "ready") break;
      }
      if (result.state !== "complete")
        throw Error(
          result.message ||
            "Envio aguardando conferência. Consulte a edição da OS antes de tentar novamente.",
        );
      try{await sendOrderAttachments(company,order,attachmentFiles,file=>setAttachmentFiles(files=>files.filter(f=>f!==file)));}
      catch(e){throw Error('A OS foi atualizada no ERP, mas há anexos pendentes. '+(e as Error).message);}
      setEdit(null);
      setMessage("Observações e status do fluxo atualizados no ERP.");
      onChanged();
    });
  }
  async function send() {
    await run(async () => {
      const p = phone.replace(/[\s()+-]/g, "");
      if (!delivery.current || delivery.current.phone !== p)
        delivery.current = { id: crypto.randomUUID(), phone: p };
      await api("/api/service-scheduling/workflow", {
        action: "customer_report",
        scheduleId: String(data.schedule.id),
        phone: p,
        requestId: delivery.current.id,
      });
      delivery.current = null;
      setCustomer(false);
      setMessage("Relatório revisado na fila de envio por WhatsApp.");
    });
  }
  return (
    <section className="schedule-order-actions">
      <div className="scheduling-actions">
        <button disabled={busy} onClick={() => void openEdit()}>
          Editar observações e Status Fluxo
        </button>
        <button
          disabled={busy || !reviewed}
          onClick={() => setCustomer((v) => !v)}
        >
          Enviar relatório ao cliente
        </button>
      </div>
      {!reviewed && (
        <small>
          Envio ao cliente disponível após revisar todas as operações.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {edit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveHeader();
          }}
        >
          <OrderAttachments company={company} order={order} files={attachmentFiles} onFilesChange={setAttachmentFiles} disabled={busy} onBusy={setBusy}/>
          <label>
            Observação
            <textarea
              aria-label="Observação"
              rows={3}
              value={edit.draft.notes}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  draft: { ...edit.draft, notes: e.target.value },
                })
              }
              disabled={busy}
            />
          </label>
          <label>
            Observação Interna
            <textarea
              aria-label="Observação Interna"
              rows={3}
              value={edit.draft.internalNotes}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  draft: { ...edit.draft, internalNotes: e.target.value },
                })
              }
              disabled={busy}
            />
          </label>
          <div className="schedule-flow-field">
            <span>Status Fluxo</span>
            <OrderSearchSelect
              label="Status Fluxo"
              value={String(edit.draft.flowStatus || "")}
              selectedLabel={flows.find(f => String(f.id) === String(edit.draft.flowStatus))?.name || edit.labels.flowStatus}
              options={flows.map(f => ({id: String(f.id), displayId: String(f.id), name: f.name}))}
              placeholder="Digite para pesquisar o status"
              disabled={busy}
              onChange={row => {
                editRequest.current = null;
                setEdit((current: any) => ({
                  ...current,
                  draft: {...current.draft, flowStatus: row.id},
                  labels: {...current.labels, flowStatus: row.name},
                }));
              }}
            />
          </div>
          <div className="scheduling-actions">
            <button disabled={busy} type="submit">
              Salvar no ERP
            </button>
            <button disabled={busy} type="button" onClick={() => setEdit(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {customer && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label>
            WhatsApp do cliente (país + DDD)
            <input
              required
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5547999999999"
              disabled={busy}
            />
          </label>
          <p>
            Será enviado o relatório completo revisado, com linha do tempo. O
            link fica disponível por 14 dias.
          </p>
          <button disabled={busy}>Confirmar envio</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setCustomer(false)}
          >
            Cancelar
          </button>
        </form>
      )}

    </section>
  );
}
