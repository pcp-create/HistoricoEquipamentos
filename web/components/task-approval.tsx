"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
export default function TaskApproval({
  data,
  onChanged,
}: {
  data: any;
  onChanged: () => void;
}) {
  const [correction,setCorrection]=useState(""),[retry,setRetry]=useState(false),[reason, setReason] = useState(""),
    [decision, setDecision] = useState<"approved" | "rejected" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const t = data.task;
  async function decide(decision?: string,repeat=false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: String(t.id),
            version: t.version,
            action: repeat?"approval_retry":decision ? "approval_decide" : "approval_close",
            description:correction,
            decision,
            reason,
          }),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="task-card task-approval">
      <h3>
        <ShieldCheck size={20} />
        Solicitação de aprovação
      </h3>
      {t.approval_parent_id&&<p>Correção da <a href={"/tarefas?task="+t.approval_parent_id}>TAR-{t.approval_parent_id}</a></p>}
      {t.source_key?.startsWith("manual:workshop:") && (
        <div className="task-approval-workshop">
          <p>
            <strong>Equipamento:</strong>{" "}
            {t.equipment_id ? (
              <a href={"/equipamentos?equipment=" + t.equipment_id}>
                {t.equipment_name}
              </a>
            ) : (
              t.equipment_name
            )}
          </p>
          <p>
            <strong>Cliente:</strong> {t.customer || "Não informado"}
          </p>
        </div>
      )}
      <p className="task-approval-description">{t.approval_description}</p>
      {!!data.attachments?.length && (
        <section aria-label="Anexos da aprovação">
          <h4>Documentos para análise</h4>
          <ul>
            {data.attachments.map((attachment: any) => (
              <li key={attachment.id}>
                <a
                  href={"/api/tasks/attachments/" + encodeURIComponent(attachment.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {attachment.filename}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {t.approval_state === "pending" ? (
        <>
          {data.canDecideApproval ? (
            <>
              <p>
                Analise a solicitação. A decisão será devolvida ao solicitante.
              </p>
              {decision && (
                <label>
                  {decision === "approved"
                    ? "Justificativa da aprovação"
                    : "Justificativa da reprovação"}
                  <textarea
                    autoFocus
                    required
                    maxLength={2000}
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
              <div className="task-toolbar">
                <button
                  disabled={busy || (decision === "approved" && !reason.trim())}
                  onClick={() => {
                    if (decision === "approved") void decide("approved");
                    else {
                      setDecision("approved");
                      setReason("");
                    }
                  }}
                >
                  <CheckCircle2 size={17} />
                  {decision === "approved" ? "Confirmar aprovação" : "Aprovar"}
                </button>
                <button
                  className="task-approval-reject"
                  disabled={busy || (decision === "rejected" && !reason.trim())}
                  onClick={() => {
                    if (decision === "rejected") void decide("rejected");
                    else {
                      setDecision("rejected");
                      setReason("");
                    }
                  }}
                >
                  <XCircle size={17} />
                  {decision === "rejected"
                    ? "Confirmar reprovação"
                    : "Reprovar"}
                </button>
                {decision && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDecision(null);
                      setReason("");
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </>
          ) : (
            <p>Aguardando decisão do responsável pela aprovação.</p>
          )}
        </>
      ) : (
        <div className={"task-approval-result " + t.approval_state}>
          <strong>
            {t.approval_state === "approved"
              ? "Aprovada · De acordo para seguir com o processo"
              : "Reprovada · Devolvida ao solicitante"}
          </strong>
          <p>{t.approval_reason}</p>
          <small>
            Decisão registrada em{" "}
            {new Date(t.approval_decided_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </small>
          {t.approval_state==='rejected'&&(data.canRetryApproval??data.canCloseApproval)&&!data.approvalCorrection&&<div><button disabled={busy} onClick={()=>setRetry(true)}>Criar nova solicitação corrigida</button>{retry&&<><label>Correção da tratativa<textarea required maxLength={10000} rows={4} value={correction} onChange={e=>setCorrection(e.target.value)}/></label><button disabled={busy||!correction.trim()} onClick={()=>void decide(undefined,true)}>Enviar nova solicitação</button><button disabled={busy} onClick={()=>setRetry(false)}>Cancelar</button></>}</div>}
          {data.approvalCorrection&&<p>Nova solicitação: <a href={"/tarefas?task="+data.approvalCorrection}>TAR-{data.approvalCorrection}</a></p>}
          {data.canCloseApproval && (
            <p>
              <button disabled={busy} onClick={() => decide()}>
                Concluir tratativa
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
