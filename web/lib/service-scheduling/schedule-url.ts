export function scheduleUrl(schedule: {id: string | number; numero_sequencia?: string | number | null; order_id?: string | number | null; company_id?: string | number}) {
  const number = schedule.numero_sequencia ?? schedule.order_id;
  if (!number) return "/programacao?id=" + encodeURIComponent(schedule.id);
  const query = new URLSearchParams({OS: String(number)});
  return "/programacao?" + query;
}
