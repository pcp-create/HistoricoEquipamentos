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
  const [reason, setReason] = useState(""),
    [decision, setDecision] = useState<"approved" | "rejected" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const t = data.task;
  async function decide(decision?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: String(t.id),
            version: t.version,
            action: decision ? "approval_decide" : "approval_close",
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
