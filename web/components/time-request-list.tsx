"use client";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
const fmt = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
export default function TimeRequestList({ requests, operations }: any) {
  if (!requests?.length) return null;
  return (
    <section className="time-requests">
      <h3>Solicitações e histórico de ajustes</h3>
      {requests.map((r: any) => {
        const op = operations.find((o: any) => o.id === r.operation_id);
        return (
          <details key={r.id}>
            <summary>
              {op?.order_number ? "OS " + op.order_number + " · " : ""}Operação{" "}
              {operationNumber(op?.position)} · {r.actor_name || ""}{" "}
              {
                (
                  {
                    pending: "Aguardando aprovação",
                    approved: "Aprovado",
                    rejected: "Rejeitado",
                    superseded: "Substituído",
                  } as any
                )[r.status]
              }{" "}
              · {fmt(r.created_at)}
            </summary>
            <p>
              <strong>Motivo:</strong> {r.reason}
            </p>
            <p>
              Solicitado: {fmt(r.proposed.started_at)} até{" "}
              {fmt(r.proposed.finished_at)}
            </p>
            <p>
              Tempo efetivo: {(r.proposed.active_seconds / 3600).toFixed(2)} h ·
              Paradas: {(r.proposed.pause_seconds / 3600).toFixed(2)} h
            </p>
            {r.original?.started_at && (
              <p>
                Original:{" "}
                {fmt(
                  r.original.correction?.started_at || r.original.started_at,
                )}{" "}
                até{" "}
                {fmt(
                  r.original.correction?.finished_at || r.original.finished_at,
                )}
              </p>
            )}
            {r.original?.hours != null && (
              <p>
                Horas registradas originalmente:{" "}
                {Number(r.original.hours).toLocaleString("pt-BR")} h
              </p>
            )}
            {r.reviewed_at && (
              <p>
                Analisado por {r.reviewer_name || r.reviewed_by} em{" "}
                {fmt(r.reviewed_at)}
                {r.review_reason ? " · " + r.review_reason : ""}
              </p>
            )}
          </details>
        );
      })}
    </section>
  );
}
