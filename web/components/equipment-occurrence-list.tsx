"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
export function occurrenceDate(value: string) {
  return new Date(value.slice(0, 10) + "T12:00:00Z").toLocaleDateString(
    "pt-BR",
    { timeZone: "America/Sao_Paulo" },
  );
}
export default function EquipmentOccurrenceList({
  items = [],
  onDelete,
}: {
  items: any[];
  onDelete?: (item: any) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState<string | null>(null),
    [error, setError] = useState("");
  async function remove(b: any) {
    if (deleting || !onDelete) return;
    if (
      !window.confirm(
        `Excluir o B.O "${b.title}" de ${occurrenceDate(b.occurred_on)}? Ele será removido do histórico visível do equipamento.`,
      )
    )
      return;
    setDeleting(b.id);
    setError("");
    try {
      await onDelete(b);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível excluir o B.O.",
      );
    } finally {
      setDeleting(null);
    }
  }
  return (
    <div className="bo-list">
      {error && <p role="alert">{error}</p>}
      {items.map((b) => (
        <details key={b.id} className="bo-item">
          <summary>
            <small>
              {occurrenceDate(b.occurred_on)} · {b.equipment_name}
              {b.serial ? " · Série " + b.serial : ""}
            </small>
            <strong>{b.title}</strong>
            <span>
              {b.description.length > 180
                ? b.description.slice(0, 180) + "…"
                : b.description}
            </span>
            <em>Ver ocorrência completa</em>
          </summary>
          <div className="bo-complete">
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {b.description}
            </p>
            <div className="bo-record-footer">
              <small>
                Registrado por {b.author} ·{" "}
                {new Date(b.created_at).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}{" "}
                (Brasília)
              </small>
              {onDelete && (
                <button
                  type="button"
                  className="bo-delete"
                  aria-label={`Excluir B.O: ${b.title}`}
                  title="Excluir B.O"
                  disabled={deleting !== null}
                  onClick={() => void remove(b)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {deleting === b.id && <span>Excluindo…</span>}
                </button>
              )}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
