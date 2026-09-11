import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeImages,
  imageIdentity,
  ProductImageService,
} from "../lib/product-images";
const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 0, 255, 217]).toString(
  "base64",
);
const payload = { data: [{ formato: "jpeg", imagem: jpeg }], errors: [] };
test("images validate identity, decode raster types and reject executable/oversized payloads", () => {
  for (const [company, id] of [
    ["3", "1"],
    ["1", "../1"],
    ["1", "0"],
    ["1", "2147483648"],
  ])
    assert.throws(() => imageIdentity(company, id));
  assert.equal(imageIdentity("27404", "123"), "27404:123");
  assert.equal(decodeImages(payload).images[0].mime, "image/jpeg");
  const result = decodeImages({
    data: [
      ...payload.data,
      ...payload.data,
      { imagem: Buffer.from('<svg onload="alert(1)"/>').toString("base64") },
      { imagem: "https://example.com/image.jpg" },
      { imagem: "a".repeat(4 * 1024 * 1024 + 4) },
    ],
  });
  assert.equal(result.images.length, 1);
  assert.equal(result.unsupported, 3);
  assert.equal(decodeImages({ data: [] }).images.length, 0);
  assert.throws(() => decodeImages({ errors: ["bad"] }));
  assert.throws(() => decodeImages({ data: [], errors: ["bad"] }));
});
test("M8 image cache isolates companies, coalesces requests, expires and retries authentication once", async () => {
  const keys = ["M8_TENANT", "M8_USERNAME", "M8_PASSWORD"];
  const previous = keys.map((k) => process.env[k]);
  keys.forEach((k) => (process.env[k] = "test-only"));
  try {
    let now = 1000000,
      images = 0,
      auth = 0;
    const companies: number[] = [];
    const transport: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/auth/token")) {
        auth++;
        companies.push(JSON.parse(String(init?.body)).company);
        return Response.json({ data: { token: "test-token-" + auth } });
      }
      images++;
      if (images === 1) return new Response("", { status: 401 });
      return Response.json(payload);
    };
    const service = new ProductImageService(transport, () => now);
    const [a, b] = await Promise.all([
      service.get("1", "10"),
      service.get("1", "10"),
    ]);
    assert.equal(a, b);
    assert.equal(images, 2);
    assert.equal(auth, 2);
    await service.get("1", "10");
    assert.equal(images, 2);
    await service.get("2", "10");
    assert.equal(images, 3);
    assert.equal(companies.at(-1), 2);
    now += 600001;
    await service.get("1", "10");
    assert.equal(images, 4);
  } finally {
    keys.forEach((k, i) => {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    });
  }
});
test("empty image sets expire sooner, failures are not cached and oversized responses are bounded", async () => {
  const keys = ["M8_TENANT", "M8_USERNAME", "M8_PASSWORD"];
  const previous = keys.map((k) => process.env[k]);
  keys.forEach((k) => (process.env[k] = "test-only"));
  try {
    let now = 1000,
      calls = 0,
      fail = false;
    const service = new ProductImageService(
      async (input) => {
        if (String(input).endsWith("/auth/token"))
          return Response.json({ data: { token: "test" } });
        calls++;
        return fail
          ? new Response("", { status: 503 })
          : Response.json({ data: [] });
      },
      () => now,
    );
    await service.get("1", "1");
    await service.get("1", "1");
    assert.equal(calls, 1);
    now += 120001;
    fail = true;
    await assert.rejects(service.get("1", "1"));
    fail = false;
    await service.get("1", "1");
    assert.equal(calls, 3);
    const huge = new ProductImageService(async (input) =>
      String(input).endsWith("/auth/token")
        ? Response.json({ data: { token: "test" } })
        : new Response("x".repeat(16 * 1024 * 1024 + 1)),
    );
    await assert.rejects(huge.get("1", "1"), /limite de tamanho/);
  } finally {
    keys.forEach((k, i) => {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    });
  }
});
