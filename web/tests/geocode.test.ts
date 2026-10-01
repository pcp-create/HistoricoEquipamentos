import { test } from "node:test";
import assert from "node:assert/strict";
import {
  geocodeLocality,
  candidatePoint,
} from "../lib/service-scheduling/geocode";
import {
  positionLabel,
  type Locality,
} from "../lib/service-scheduling/map-model";
const a: Locality = {
  person_id: "1",
  address_id: "2",
  address_type: "Padrao",
  street: "RUA A ATE RUA B EXCLUSIVE",
  number: "10",
  city: "Aurora",
  state: "SC",
  postal_code: "89186-000",
  country: "Brasil",
  district: null,
  complement: null,
};
const city = {
  lat: -27,
  lon: -49,
  country_code: "br",
  state_code: "SC",
  city: "Aurora",
  result_type: "city",
  rank: { confidence: 1 },
};
test("tries full address then cleaned street before accepting a municipal reference", async () => {
  const calls: URL[] = [];
  const result = await geocodeLocality(a, "test", async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return Response.json({
      results: [calls.length === 1 ? city : { ...city, result_type: "street" }],
    });
  });
  assert.equal(result.precision, "street");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get("street"), "RUA A");
  assert.equal(calls[1].searchParams.has("housenumber"), false);
});
test("postcode and municipality fallbacks are labelled, and never accept another city, state or country", async () => {
  let calls = 0;
  const result = await geocodeLocality(a, "test", async () => {
    calls++;
    return Response.json({ results: [city] });
  });
  assert.equal(calls, 4);
  assert.equal(result.precision, "city");
  assert.match(positionLabel(result.precision), /não é o endereço/);
  assert.equal(
    candidatePoint(
      { ...city, result_type: "postcode", postcode: "89186000" },
      a,
    )?.precision,
    "postcode",
  );
  for (const result of [
    { ...city, state_code: "PR" },
    { ...city, city: "Blumenau" },
    { ...city, country_code: "us" },
    { ...city, result_type: "postcode", postcode: "00000000" },
    { ...city, lat: 999 },
  ])
    assert.equal(candidatePoint(result, a), null);
});
test("provider failures stop attempts; incomplete street can still locate municipality", async () => {
  let calls = 0;
  await assert.rejects(() =>
    geocodeLocality(a, "test", async () => {
      calls++;
      return new Response("", { status: 429 });
    }),
  );
  assert.equal(calls, 1);
  const result = await geocodeLocality(
    { ...a, street: null, postal_code: null },
    "test",
    async () => Response.json({ results: [city] }),
  );
  assert.equal(result.precision, "city");
});
