import { displayedScheduleStatus } from './display-status';

type DeliveryOrder = { expected_delivery_date?: string | null; order_status?: string; programming_status?: string };
function deliveryMonth(order: DeliveryOrder) {
  const date = order.expected_delivery_date;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null;
}
export function isCarriedDelivery(order: DeliveryOrder, month: string) {
  const expected = deliveryMonth(order);
  return !!expected && expected < month && !['completed', 'cancelled'].includes(displayedScheduleStatus(order));
}
export function matchesDeliveryProjection(order: DeliveryOrder, month: string) {
  return !month || deliveryMonth(order) === month || isCarriedDelivery(order, month);
}
