export const linkedOrder = "l.company_id=o.company_id AND l.order_id=o.id_m8";
export const linkedSerial = (parameter: string) =>
  `EXISTS(SELECT 1 FROM public.m8_equipment_linked l WHERE ${linkedOrder} AND l.serial=${parameter})`;
