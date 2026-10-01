export type Locality = {
  address_id: string;
  person_id: string;
  address_type: string | null;
  street: string | null;
  number: string | null;
  letter?: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude?: number | null;
  longitude?: number | null;
  precision?: string | null;
  provider?: string | null;
};
export function localityText(a: Locality) {
  return [
    [a.street, [a.number, a.letter].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
    a.complement,
    a.district,
    [a.city, a.state].filter(Boolean).join(" / "),
    a.postal_code,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function addressIdentity(a: Locality) {
  return JSON.stringify(
    [
      a.street,
      a.number,
      a.letter,
      a.complement,
      a.district,
      a.city,
      a.state,
      a.postal_code,
      a.country,
    ].map((v) => (v || "").trim().toLocaleUpperCase("pt-BR")),
  );
}
export function chooseLocality(
  addresses: Locality[],
  deliveryId: string | null,
  choice?: string | null,
) {
  const byId = (id: string | null | undefined) =>
    addresses.find((a) => a.address_id === id);
  if (choice && byId(choice))
    return { address: byId(choice)!, reason: "Localidade selecionada" };
  if (deliveryId && deliveryId !== "0")
    return {
      address: byId(deliveryId) || null,
      reason: byId(deliveryId)
        ? "Endereço de entrega da OS"
        : "Endereço de entrega da OS ainda não coletado",
    };
  for (const type of ["Entrega", "Padrao"]) {
    const candidates = addresses.filter((a) => a.address_type === type);
    if (candidates.length === 1)
      return {
        address: candidates[0]!,
        reason:
          type === "Entrega"
            ? "Endereço de entrega do cliente"
            : "Endereço padrão do cliente",
      };
    if (candidates.length > 1)
      return { address: null, reason: "Selecione a localidade de atendimento" };
  }
  return addresses.length === 1
    ? { address: addresses[0]!, reason: "Localidade do cliente" }
    : {
        address: null,
        reason: addresses.length
          ? "Selecione a localidade de atendimento"
          : "Localidade ainda não coletada",
      };
}
export function validPoint(lat: unknown, lng: unknown) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -85 &&
    lat <= 85 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function positionLabel(precision?: string | null) {
  return (
    (
      {
        confirmed: "Posição confirmada manualmente",
        address: "Posição encontrada pelo endereço",
        street: "Aproximada: rua, sem confirmação do número",
        district: "Aproximada: região do bairro",
        postcode: "Aproximada: região do CEP",
        city: "Aproximada: referência do município, não é o endereço do cliente",
      } as Record<string, string>
    )[precision || ""] || "Localidade posicionada"
  );
}
