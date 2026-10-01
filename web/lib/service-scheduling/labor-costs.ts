export function includesLaborCost(settings: any, serviceType: string): boolean {
  const configured = settings?.serviceTypeLaborCosts?.[serviceType];
  if (typeof configured === "boolean") return configured;
  const name = String(serviceType || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return !!name.trim() && !/terceir/.test(name);
}
