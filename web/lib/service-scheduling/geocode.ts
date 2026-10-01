import { validPoint, type Locality } from "./map-model";
const fold = (v: unknown) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
const states: Record<string, string> = {
  AC: "ACRE",
  AL: "ALAGOAS",
  AP: "AMAPA",
  AM: "AMAZONAS",
  BA: "BAHIA",
  CE: "CEARA",
  DF: "DISTRITO FEDERAL",
  ES: "ESPIRITO SANTO",
  GO: "GOIAS",
  MA: "MARANHAO",
  MT: "MATO GROSSO",
  MS: "MATO GROSSO DO SUL",
  MG: "MINAS GERAIS",
  PA: "PARA",
  PB: "PARAIBA",
  PR: "PARANA",
  PE: "PERNAMBUCO",
  PI: "PIAUI",
  RJ: "RIO DE JANEIRO",
  RN: "RIO GRANDE DO NORTE",
  RS: "RIO GRANDE DO SUL",
  RO: "RONDONIA",
  RR: "RORAIMA",
  SC: "SANTA CATARINA",
  SP: "SAO PAULO",
  SE: "SERGIPE",
  TO: "TOCANTINS",
};
export class GeocodeError extends Error {}
export type GeocodedPoint = {
  latitude: number;
  longitude: number;
  precision: string;
  provider: string;
};
export function candidatePoint(
  result: any,
  address: Locality,
): GeocodedPoint | null {
  if (
    !result ||
    !validPoint(result.lat, result.lon) ||
    fold(result.country_code) !== "BR"
  )
    return null;
  const uf = fold(address.state),
    code = fold(result.state_code).replace(/^BR-/, ""),
    state = fold(result.state);
  if (code !== uf && state !== uf && state !== (states[uf] || uf)) return null;
  const city = fold(address.city),
    sameCity = [
      result.city,
      result.town,
      result.village,
      result.municipality,
    ].some((v) => city && fold(v) === city);
  const zip = (v: unknown) => String(v || "").replace(/\D/g, "");
  const sameZip =
    zip(address.postal_code).length === 8 &&
    zip(result.postcode) === zip(address.postal_code);
  if (
    !sameCity &&
    !(
      sameZip &&
      !result.city &&
      !result.town &&
      !result.village &&
      !result.municipality
    )
  )
    return null;
  const confidence = Number(result.rank?.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.6) return null;
  const precision = (
    {
      building: "address",
      amenity: "address",
      street: "street",
      postcode: "postcode",
      suburb: "district",
      district: "district",
      city: "city",
    } as Record<string, string>
  )[result.result_type];
  if (!precision || (precision === "postcode" && !sameZip)) return null;
  return {
    latitude: result.lat,
    longitude: result.lon,
    precision,
    provider: "geoapify",
  };
}
export async function geocodeLocality(
  address: Locality,
  key: string,
  request: typeof fetch = fetch,
) {
  if (!address.city || !address.state)
    throw new GeocodeError("Informe município e UF para localizar o endereço.");
  const base = { city: address.city, state: address.state, country: "Brasil" };
  const street = (address.street || "")
    .replace(/\s+(?:ATÉ|ATE)\s+(?:RUA|AVENIDA|AV\.|RODOVIA)\b.*$/i, "")
    .trim();
  const postal = (address.postal_code || "").replace(/\D/g, "");
  const queries: Record<string, string>[] = [];
  if (address.street)
    queries.push({
      ...base,
      street: address.street,
      housenumber: [address.number, address.letter].filter(Boolean).join(" "),
      postcode: postal,
    });
  if (street) queries.push({ ...base, street });
  if (postal.length === 8)
    queries.push({ ...base, postcode: postal, type: "postcode" });
  queries.push({ ...base, type: "city" });
  const ranks: Record<string, number> = {
    address: 5,
    street: 4,
    district: 3,
    postcode: 2,
    city: 1,
  };
  let best: GeocodedPoint | null = null;
  for (const query of queries) {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    for (const [k, v] of Object.entries({
      ...query,
      filter: "countrycode:br",
      format: "json",
      lang: "pt",
      limit: "3",
      apiKey: key,
    }))
      if (v) url.searchParams.set(k, v);
    const response = await request(url, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new GeocodeError(
        "O serviço de localização não respondeu. Tente novamente mais tarde.",
      );
    const body = await response.json();
    for (const result of body.results || []) {
      const point = candidatePoint(result, address);
      if (point && (!best || ranks[point.precision]! > ranks[best.precision]!))
        best = point;
    }
    if (best && ["address", "street"].includes(best.precision)) return best;
  }
  if (!best)
    throw new GeocodeError(
      "Não foi possível localizar nem a região do endereço com segurança. Marque o local no mapa.",
    );
  return best;
}
