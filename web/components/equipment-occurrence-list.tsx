"use client";
export function occurrenceDate(value: string) {
  return new Date(value.slice(0, 10) + "T12:00:00Z").toLocaleDateString(
    "pt-BR",
    { timeZone: "America/Sao_Paulo" },
  );
}
export default function EquipmentOccurrenceList({
  items = [],
}: {
  items: any[];
}) {
  return (
    <div className="bo-list">
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
            <small>
              Registrado por {b.author} ·{" "}
              {new Date(b.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}{" "}
              (Brasília)
            </small>
          </div>
        </details>
      ))}
    </div>
  );
}
