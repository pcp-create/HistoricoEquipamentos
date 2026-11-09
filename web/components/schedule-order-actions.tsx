"use client";
import {Save, X, Mail, PencilLine} from "lucide-react";
import {orderObservation,appendOrderObservation} from '@/lib/service-scheduling/order-observation';
import AutoResizeTextarea from "./auto-resize-textarea";
import {canEmailOperation} from '@/lib/service-scheduling/customer-email-operations';
import CustomerReportEmail from "./customer-report-email";
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
  reviewAction,
  reportAction,
}: {
  data: any;
  onChanged: () => void;
  reviewAction?: React.ReactNode;
  reportAction?: React.ReactNode;
}) {
  const [attachSummary,setAttachSummary]=useState(true),[summaryAttached,setSummaryAttached]=useState(false),[headerSaved,setHeaderSaved]=useState(false);
  const [attachmentFiles,setAttachmentFiles]=useState<File[]>([]);
  const [edit, setEdit] = useState<any>(null),
    [flows, setFlows] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [customer, setCustomer] = useState(false);
  const editRequest = useRef<string | null>(null);
  const company = String(data.schedule.company_id),
    order = String(data.schedule.order_id);
  const standardObservation=orderObservation(data.detail?.order||{},data.operations||[],String(data.schedule.order_id));
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
      setAttachSummary(true);setSummaryAttached(false);setHeaderSaved(false);
      setEdit({...e,draft:{...e.draft,notes:appendOrderObservation(e.draft.notes||'',standardObservation)}});
      setFlows(f.rows);
      editRequest.current = null;
    });
  }
  async function saveHeader() {
    await run(async () => {
      if(attachSummary&&!reviewed)throw Error("Conclua a revisão de todas as operações ou desmarque o anexo automático.");
      if(!headerSaved){
      const id =
        editRequest.current || (editRequest.current = crypto.randomUUID());
      await api("/api/service-orders", {
        action: "edit-prepare",
        id,
        company,
        order,
        version: edit.version,
        draft: {...edit.draft,notes:appendOrderObservation(edit.draft.notes||'',standardObservation)},
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
      setHeaderSaved(true);
      }
      if(attachSummary&&!summaryAttached){
        try{await api('/api/service-scheduling/summary-attachment',{scheduleId:String(data.schedule.id)});setSummaryAttached(true);}
        catch(e){throw Error('A OS foi atualizada no ERP, mas o relatório resumido não foi anexado. '+(e as Error).message);}
      }
      try{await sendOrderAttachments(company,order,attachmentFiles,file=>setAttachmentFiles(files=>files.filter(f=>f!==file)));}
      catch(e){throw Error('A OS foi atualizada no ERP, mas há anexos pendentes. '+(e as Error).message);}
      setEdit(null);
      setMessage("Observações e status do fluxo atualizados no ERP."+(attachSummary?" Relatório resumido anexado à OS.":""));
      onChanged();
    });
  }
  return (
    <section className="schedule-order-actions">
      <div className="scheduling-actions schedule-order-toolbar">
        {reviewAction}
        <button disabled={busy} onClick={() => void openEdit()}>
          <PencilLine size={18} aria-hidden="true"/>Editar observações e Status Fluxo
        </button>
        <button
          disabled={busy || !data.operations?.some(canEmailOperation)}
          onClick={() => setCustomer((v) => !v)}
        >
          <Mail size={18} aria-hidden="true"/>Enviar por e-mail
        </button>
        {reportAction}
      </div>
      {!data.operations?.some(canEmailOperation) && (
        <small>
          Envio ao cliente disponível quando houver uma operação revisada com relatório.
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
          <OrderAttachments company={company} order={order} files={attachmentFiles} onFilesChange={setAttachmentFiles} disabled={busy} onBusy={setBusy}>
          <div className="schedule-summary-attachment">
            <label><input type="checkbox" checked={attachSummary} disabled={busy||summaryAttached} onChange={e=>setAttachSummary(e.target.checked)}/> Anexar relatório resumido automaticamente na OS</label>
            <small>{reviewed?'Será anexado ao salvar no ERP.':'Revise todas as operações para anexar ou desmarque esta opção.'}</small>
          </div>
          </OrderAttachments>
          {headerSaved&&<p role="status">As alterações da OS já foram salvas. Falta concluir o envio dos anexos.</p>}
          {standardObservation&&<details className="schedule-observation-reference"><summary>Informações padrão da OS para o histórico</summary><pre>{standardObservation}</pre><button type="button" disabled={busy||headerSaved} onClick={()=>setEdit({...edit,draft:{...edit.draft,notes:appendOrderObservation(edit.draft.notes||'',standardObservation)}})}>Inserir informações na observação</button></details>}
          <label>
            Observação
            <AutoResizeTextarea
              aria-label="Observação"
              rows={3}
              value={edit.draft.notes}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  draft: { ...edit.draft, notes: e.target.value },
                })
              }
              disabled={busy||headerSaved}
            />
          </label>
          <label>
            Observação Interna
            <AutoResizeTextarea
              aria-label="Observação Interna"
              rows={3}
              value={edit.draft.internalNotes}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  draft: { ...edit.draft, internalNotes: e.target.value },
                })
              }
              disabled={busy||headerSaved}
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
              disabled={busy||headerSaved}
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
            <button className="schedule-save-erp" disabled={busy} type="submit"><Save size={18} aria-hidden="true"/>
              {busy?"Salvando e enviando anexos…":headerSaved?"Reenviar anexos pendentes":"Salvar no ERP"}
            </button>
            <button disabled={busy} type="button" onClick={() => {setEdit(null);if(headerSaved)onChanged();}}>
              <X size={18} aria-hidden="true"/>Cancelar
            </button>
          </div>
        </form>
      )}
      {customer && <CustomerReportEmail data={data} onClose={()=>setCustomer(false)}/>}

    </section>
  );
}
