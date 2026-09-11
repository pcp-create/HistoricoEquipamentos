import "server-only";
import { createHash } from "node:crypto";
export class ImageServiceError extends Error {}
export type ProductImage = { key: string; mime: string; bytes: Buffer };
export type ImageSet = {
  images: ProductImage[];
  unsupported: number;
  collectedAt: string;
};
export function imageIdentity(company: string, id: string) {
  if (
    !["1", "2", "27404"].includes(company) ||
    !/^\d{1,10}$/.test(id) ||
    Number(id) < 1 ||
    Number(id) > 2147483647
  )
    throw new ImageServiceError("Produto ou empresa inválidos.");
  return `${company}:${Number(id)}`;
}
export function decodeImages(body: unknown): Omit<ImageSet, "collectedAt"> {
  const value = body as { data?: unknown; errors?: unknown };
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    (value.errors != null &&
      (!Array.isArray(value.errors) || value.errors.length))
  )
    throw new ImageServiceError("Resposta de imagens inválida.");
  if (value.data == null) return { images: [], unsupported: 0 };
  if (!Array.isArray(value.data) || value.data.length > 50)
    throw new ImageServiceError("Resposta de imagens inválida.");
  const images: ProductImage[] = [];
  let unsupported = 0;
  for (const row of value.data) {
    if (!row || typeof row.imagem !== "string" || !row.imagem.trim()) {
      unsupported++;
      continue;
    }
    const raw = row.imagem
      .replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "")
      .replace(/\s/g, "");
    if (
      raw.length > 4 * 1024 * 1024 ||
      !raw.length ||
      raw.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)
    ) {
      unsupported++;
      continue;
    }
    const bytes = Buffer.from(raw, "base64");
    let mime = "";
    if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
      mime = "image/jpeg";
    else if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    else if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()))
      mime = "image/gif";
    else if (
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP"
    )
      mime = "image/webp";
    if (!mime) {
      unsupported++;
      continue;
    }
    const key = createHash("sha256").update(bytes).digest("hex");
    if (!images.some((i) => i.key === key)) images.push({ key, mime, bytes });
  }
  return { images, unsupported };
}
async function limitedJson(response: Response, max: number) {
  if (!response.ok || !response.body)
    throw new ImageServiceError("O M8 não respondeu à consulta de fotos.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > max)
        throw new ImageServiceError(
          "A resposta de fotos excede o limite de tamanho.",
        );
      chunks.push(r.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
function settings() {
  const get = (key: string) => {
    const value = process.env[key];
    if (!value?.trim())
      throw new ImageServiceError(
        "Consulta de fotos não configurada no servidor.",
      );
    return value;
  };
  const base = (
    process.env.M8_API_URL || "https://api.integra.m8sistemas.com.br"
  ).replace(/\/+$/, "");
  const u = new URL(base);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw new ImageServiceError("Endereço M8 inválido.");
  return {
    base,
    tenant: get("M8_TENANT"),
    username: get("M8_USERNAME"),
    password: get("M8_PASSWORD"),
    domain: process.env.M8_DOMAIN || "app.erpm8.cloud",
  };
}
export class ProductImageService {
  private cache = new Map<
    string,
    { data: ImageSet; expires: number; size: number }
  >();
  private pending = new Map<string, Promise<ImageSet>>();
  private tokens = new Map<string, { value: string; expires: number }>();
  private authentication = new Map<string, Promise<string>>();
  constructor(
    private transport: typeof fetch = fetch,
    private now = Date.now,
  ) {}
  private async token(company: string) {
    const old = this.tokens.get(company);
    if (old && old.expires > this.now()) return old.value;
    const existing = this.authentication.get(company);
    if (existing) return existing;
    const promise = (async () => {
      const cfg = settings();
      const r = await this.transport(cfg.base + "/v1/auth/token", {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: cfg.tenant,
          username: cfg.username,
          password: cfg.password,
          company: Number(company),
          domain: cfg.domain,
        }),
      });
      const body = await limitedJson(r, 128 * 1024);
      if (
        body.errors != null &&
        (!Array.isArray(body.errors) || body.errors.length)
      )
        throw new ImageServiceError(
          "Não foi possível autenticar a consulta de fotos.",
        );
      const token = body.data?.token;
      if (typeof token !== "string" || !token.trim())
        throw new ImageServiceError(
          "Não foi possível autenticar a consulta de fotos.",
        );
      let expires = this.now() + 240000;
      try {
        const exp = JSON.parse(
          Buffer.from(token.split(".")[1] || "", "base64url").toString(),
        ).exp;
        if (typeof exp === "number")
          expires = Math.min(expires, exp * 1000 - 30000);
      } catch {}
      this.tokens.set(company, { value: token, expires });
      return token;
    })().finally(() => this.authentication.delete(company));
    this.authentication.set(company, promise);
    return promise;
  }
  async get(company: string, id: string): Promise<ImageSet> {
    const key = imageIdentity(company, id);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.data;
    }
    this.cache.delete(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 4)
      throw new ImageServiceError(
        "Há outras fotos sendo carregadas. Tente novamente em instantes.",
      );
    const promise = this.load(company, String(Number(id)))
      .then((data) => {
        const size = data.images.reduce((n, i) => n + i.bytes.length, 0);
        this.cache.set(key, {
          data,
          size,
          expires: this.now() + (data.images.length ? 600000 : 120000),
        });
        let total = [...this.cache.values()].reduce((n, v) => n + v.size, 0);
        while (this.cache.size > 32 || total > 32 * 1024 * 1024) {
          const first = this.cache.keys().next().value!;
          total -= this.cache.get(first)!.size;
          this.cache.delete(first);
        }
        return data;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  private async load(company: string, id: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token(company);
      const response = await this.transport(
        settings().base + `/v1/estoque/produto/${id}/imagem`,
        {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel();
        if (this.tokens.get(company)?.value === token)
          this.tokens.delete(company);
        continue;
      }
      return {
        ...decodeImages(await limitedJson(response, 16 * 1024 * 1024)),
        collectedAt: new Date(this.now()).toISOString(),
      };
    }
    throw new ImageServiceError(
      "Não foi possível autenticar a consulta de fotos.",
    );
  }
}
const globalImages = globalThis as unknown as {
  productImageService?: ProductImageService;
};
export function productImages() {
  return (globalImages.productImageService ??= new ProductImageService());
}
