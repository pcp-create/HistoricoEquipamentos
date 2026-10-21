export type VisitHealth = "current" | "due" | "overdue";
export const healthLabels = {
  current: "Em dia",
  due: "Próxima do vencimento",
  overdue: "Vencida",
};
export function brazilDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number),
    end = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, end)))
    .toISOString()
    .slice(0, 10);
}
export function visitHealth(
  last: string | null,
  today = brazilDay(new Date()),
): VisitHealth {
  if (!last) return "overdue";
  const day = brazilDay(last);
  return today >= addMonths(day, 6)
    ? "overdue"
    : today >= addMonths(day, 5)
      ? "due"
      : "current";
}
export type VisitCustomer = {
  key: string;
  name: string;
  document: string;
  city: string;
  uf: string;
  address: string;
  lead: boolean;
  seller_ids?: string[];
  in_portfolio?: boolean;
  locationVersion?: number;
  equipment?: { id: string; name: string; model: string; serial: string; meter?: number | null; meterDate?: string; version?: number | null }[];
  latitude: number | null;
  longitude: number | null;
  lastVisit: string | null;
  health: VisitHealth;
};
export type SalesVisit = {
  purpose_id?: string;
  purpose_name?: string;
  seller?: string;
  id: string;
  customer_key: string;
  scheduled_at: string;
  contact: string;
  phone: string;
  description: string;
  completed_at: string | null;
  outcome: string;
  status: "scheduled" | "completed" | "cancelled";
  version: number;
};
export type VisitSellerLocation = {
  id: string; name: string; enabled?: boolean; latitude: number | null; longitude: number | null;
  located_at: string | null; last_seen_at: string | null; online: boolean;
};
export type VisitPurpose = {id:string;name:string;description:string;active:boolean;version:number};
export type VisitsData = {
  canEditVisits?: boolean;
  purposes?: VisitPurpose[];
  canManage?: boolean;
  sellers?: VisitSellerLocation[];
  name: string;
  customers: VisitCustomer[];
  visits: SalesVisit[];
};
