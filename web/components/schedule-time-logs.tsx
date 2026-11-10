"use client";
import {technicianTimeChangesLocked} from "@/lib/service-scheduling/execution-locks";
import {Plus,FilePenLine,Copy,Trash2} from "lucide-react";
import TimeLogDeleteDialog from "./time-log-delete-dialog";
import TeamMemberPicker from "./team-member-picker";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import TimeAdjustmentForm from "./time-adjustment-form";
import TimeRequestList from "./time-request-list";
import { useEffect, useState } from "react";
import { timeLogs, elapsedTime } from "@/lib/service-scheduling/time-logs";
import "./schedule-time-logs.css";
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";
export default function ScheduleTimeLogs({
  data,
  technician = false,
  onChanged,
  onRefresh,
}: any) {
  const technicianCanChange=(operation:any)=>!data.technicianTimeReadOnly&&!technicianTimeChangesLocked(operation,data.email);
  const editableOperations=technician?(data.operations||[]).filter(technicianCanChange):(data.operations||[]);
  const canManage=!technician&&data.canEditSettings===true;
  const [deleting,setDeleting]=useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [replicating,setReplicating]=useState<any>(null);
  const [replicationMessage,setReplicationMessage]=useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { rows, summary } = timeLogs(
    data.fieldSessions || [],
    data.fieldEvents || [],
    data.events || [],
    now,
  );
  const cards = [
    ["Apontamentos", String(summary.count)],
    ["Pessoas", String(summary.people)],
    ["Deslocamento", elapsedTime(summary.travel)],
    ["Atividade", elapsedTime(summary.work)],
    ["Paradas", elapsedTime(summary.pause)],
    ["Tempo total", elapsedTime(summary.total)],
  ];
  return (
    <section className="schedule-time-logs" aria-label="Apontamentos da OS">
      {(technician||canManage) && (
        <div className="time-log-toolbar">
          {data.timeAdjustmentsAvailable !== false && (!technician||editableOperations.length>0) && (
            <button className="time-log-primary-action" onClick={() => setEditing({})}><Plus size={17}/>Incluir apontamento manual</button>
          )}
          {onRefresh && <button onClick={onRefresh}>Atualizar</button>}
        </div>
      )}
      {replicationMessage && <p role="status">{replicationMessage}</p>}
      {replicating && (!technician||editableOperations.length>0) && <TeamMemberPicker title="Replicar apontamento" description="Os horários e as pausas deste apontamento serão copiados para os integrantes selecionados. Cada pessoa terá seu próprio registro." confirmLabel="Replicar apontamento"
        members={(data.users || []).filter((user:any)=>user.enabled!==false&&user.email!==replicating.row.actor&&(canManage||replicating.support.includes(user.email)))}
        onClose={()=>setReplicating(null)} onConfirm={async members=>{
          const response=await fetch(canManage?"/api/service-scheduling/time-logs":"/api/field/replicate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...(canManage?{action:"replicate"}:{}),sessionId:replicating.row.id,members})});
          const result=await response.json();if(!response.ok)throw Error(result.error);
          setReplicationMessage(result.copied ? "Apontamento replicado para "+result.copied+" integrante(s)." : "Este apontamento já foi replicado para os integrantes selecionados.");
          await onChanged?.();
        }}/>}
      {deleting&&<TimeLogDeleteDialog row={deleting} onClose={()=>setDeleting(null)} onDeleted={async()=>{setReplicationMessage("Apontamento excluído. Totais atualizados.");await onChanged?.();}}/>}
      {editing && (!technician||editableOperations.length>0) && (
        <TimeAdjustmentForm
          row={editing.id ? editing : null}
          operations={editableOperations}
          users={data.users||[]}
          planner={!technician}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
      <div className="time-log-cards">
        {cards.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p>
        Tempos somados por pessoa · Atividade sem pausas · Total = deslocamento
        + atividade + paradas. Horários de Brasília. Solicitações aguardando
        aprovação não entram nos totais.
      </p>
      <TimeRequestList
        requests={data.requests}
        operations={data.operations || []}
      />
      {!rows.length && (
        <p className="time-log-empty">
          Nenhum apontamento registrado nesta OS.
        </p>
      )}
      {(data.operations || []).map((operation: any) => {
        const items = rows.filter((r) => r.operation_id === operation.id);
        if (!items.length) return null;
        return (
          <section className="time-log-operation" key={operation.id}>
            <h3>
              {operation.order_number
                ? "OS " + operation.order_number + " · "
                : ""}
              Operação {operationNumber(operation.position)} · {operation.document.description}
            </h3>
            <small>
              {items.length} apontamento(s) · Total{" "}
              {elapsedTime(items.reduce((n, r) => n + r.total, 0))}
            </small>
            <div className="scheduling-table">
              <table>
                <thead>
                  <tr>
                    <th>Pessoa / tipo</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Tempo</th>
                    <th>Total</th>
                    {!technician && <th>Localização original</th>}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <LogRows
                      key={r.id}
                      row={r}
                      technician={technician}
                      canAdjust={data.timeAdjustmentsAvailable !== false&&(canManage||(technician&&technicianCanChange(operation)))}
                      onEdit={() => setEditing(r)}
                      canDelete={canManage&&data.timeAdjustmentsAvailable!==false}
                      onDelete={()=>setDeleting(r)}
                      canReplicate={canManage||(technician && technicianCanChange(operation) && (operation.document?.support || []).some((email:string)=>email!==data.email))}
                      onReplicate={()=>setReplicating({row:r,support:operation.document?.support || []})}
                      pending={data.requests?.some(
                        (q: any) =>
                          (q.session_id === r.id ||
                            (r.legacyEventId &&
                              q.legacy_event_id === r.legacyEventId)) &&
                          q.status === "pending",
                      )}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </section>
  );
}
function LogRows({ row: r, technician, onEdit, pending, canAdjust,canReplicate,onReplicate,canDelete,onDelete }: any) {
  return (
    <>
      <tr>
        <td data-label="Pessoa / tipo">
          <strong>{r.display_name || r.actor}</strong>
          <span className="time-log-secondary">
            {r.kind === "travel" ? "Deslocamento" : "Atividade"} ·{" "}
            {r.state === "paused"
              ? "Em pausa"
              : r.state === "running"
                ? "Em andamento"
                : "Finalizado"}
          </span>
          {r.replicatedBy && <small>Replicado por {r.replicatedBy}</small>}
          {r.manual && (
            <small>
              Registro manual em {date(r.recorded_at)}. Início e fim não
              informados.
            </small>
          )}
          {r.kind === "travel" && r.odometer_start != null && (
            <small>
              Odômetro: {Number(r.odometer_start).toLocaleString("pt-BR")} →{" "}
              {r.odometer_end == null
                ? "Em andamento"
                : Number(r.odometer_end).toLocaleString("pt-BR")}{" "}
              km
            </small>
          )}
        </td>
        <td data-label="Início">{date(r.started_at)}</td>
        <td data-label="Fim">
          {r.manual
            ? "—"
            : r.finished_at
              ? date(r.finished_at)
              : "Em andamento"}
        </td>
        <td data-label="Tempo">{elapsedTime(r.active)}</td>
        <td data-label="Total">
          <strong>{elapsedTime(r.total)}</strong>
          {r.adjusted && (
            <small>
              {r.correction?.manual ? "Manual aprovado" : "Horário ajustado"}
            </small>
          )}
        </td>
        {!technician && <td data-label="Localização original">
          <Coordinates label="Início" value={r.startLocation} />
          <Coordinates label="Fim" value={r.endLocation} />
          {r.originalPauses?.length > 0 && (
            <details>
              <summary>Localização das pausas originais</summary>
              {r.originalPauses.map((p: any, i: number) => (
                <div key={i}>
                  {p.reason}
                  <Coordinates label="Início" value={p.startLocation} />
                  <Coordinates label="Fim" value={p.endLocation} />
                </div>
              ))}
            </details>
          )}
          {r.correction?.requestLocation && (
            <Coordinates
              label="Local da solicitação manual"
              value={r.correction.requestLocation}
            />
          )}
        </td>}
        <td data-label="Ações"><div className="time-log-row-actions">
          {canAdjust && r.state === "finished" && (
            <button className="time-log-action" disabled={pending} onClick={onEdit}><FilePenLine size={16}/>
              {pending
                ? "Aguardando aprovação"
                : technician
                  ? "Solicitar ajuste"
                  : "Ajustar horas"}
            </button>
          )}
          {canReplicate && r.state==="finished" && <button className="time-log-action" disabled={pending || !!r.legacyEventId || r.manual} title={r.legacyEventId || r.manual ? "Disponível para apontamentos com início e fim registrados" : "Replicar para a equipe de apoio"} onClick={onReplicate}><Copy size={16}/>Replicar apontamento</button>}
          {canDelete&&r.state==='finished'&&<button className="time-log-action time-log-delete" disabled={pending} onClick={onDelete}><Trash2 size={16}/>Excluir apontamento</button>}
          </div>
        </td>
      </tr>
      {r.pauses.map((p: any, i: number) => (
        <tr className="time-log-pause" key={i}>
          <td data-label="Pausa">
            Pausa · {p.reason}
            <small>{r.display_name || r.actor}</small>
          </td>
          <td data-label="Início">{date(p.start)}</td>
          <td data-label="Fim">{p.end ? date(p.end) : "Em pausa"}</td>
          <td data-label="Tempo">{elapsedTime(p.seconds)}</td>
          <td>
            <small>Incluída no total acima</small>
          </td>
          {!technician && <td data-label="Localização original">
            <Coordinates label="Início" value={p.startLocation} />
            <Coordinates label="Fim" value={p.endLocation} />
          </td>}
          <td />
        </tr>
      ))}
    </>
  );
}

function Coordinates({ label, value }: any) {
  return (
    <small>
      {label}:{" "}
      {value?.document?.replicatedBy && <span>Local registrado por {value.document.locationRecordedBy || value.document.replicatedBy} · </span>}
      {value?.latitude != null && value?.longitude != null ? (
        <>
          <span>Lat. {Number(value.latitude).toFixed(6)}</span>
          <br />
          <span>Long. {Number(value.longitude).toFixed(6)}</span>
        </>
      ) : (
        "Não registrada"
      )}
    </small>
  );
}
