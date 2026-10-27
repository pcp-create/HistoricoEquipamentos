export default function CommercialUpdateStatus({ ordersUpdatedAt, updatedAt }: {
  ordersUpdatedAt?: string | null;
  updatedAt?: string | null;
}) {
  return (
    <p className="commercial-update-status" aria-label="Atualização dos dados">
      {[["OSs", ordersUpdatedAt], ["Comercial", updatedAt]].map(([label, date]) => (
        <span key={label}>
          {label}: {date ? <time dateTime={date} title={new Date(date).toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"})}>{new Date(date).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          })}</time> : "aguardando coleta"}
        </span>
      ))}
      <span>Tela atualizada automaticamente a cada minuto</span>
    </p>
  );
}
