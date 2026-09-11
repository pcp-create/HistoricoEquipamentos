import { log, SafeError } from './logger.js';
export type Transport = typeof fetch;
export type Sleep = (milliseconds: number) => Promise<void>;
export const sleep: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function retryDelay(attempt: number, retryAfter: string | null, now = Date.now()): number {
  const parsed = retryAfter === null ? NaN : /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now;
  if (Number.isFinite(parsed) && parsed >= 0) {
    if (parsed > 120000) throw new SafeError('Retry-After superior a 120 segundos; repetir execução posteriormente', 429);
    return parsed;
  }
  return Math.min(1000 * 2 ** attempt + Math.floor(Math.random() * 250), 30000);
}
export async function requestWithRetry(
  url: string, init: RequestInit,
  options: { timeoutMs: number; maxAttempts: number; maxResponseBytes?: number },
  transport: Transport = fetch, pause: Sleep = sleep,
): Promise<Response> {
  const endpoint = new URL(url).pathname;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await transport(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs) });
      // Buffer only this response within the timeout, including body reads.
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            total += part.value.byteLength;
            if (total > (options.maxResponseBytes ?? 64 * 1024 * 1024)) {
              await reader.cancel();
              throw new SafeError('Resposta M8 excedeu limite de memória; revisar tamanho da consulta');
            }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      response = new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      if (error instanceof SafeError) throw error;
      if (attempt + 1 === options.maxAttempts) throw new SafeError(`Timeout/conexão em ${endpoint}; tentativas esgotadas`);
      log('M8', 'Repetindo após timeout/conexão', { endpoint, tentativa: attempt + 1 });
      await pause(retryDelay(attempt, null));
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(response.status)) return response;
    if (attempt + 1 === options.maxAttempts) throw new SafeError(`HTTP ${response.status} em ${endpoint}; tentativas esgotadas`, response.status);
    log('M8', 'Repetindo requisição', { endpoint, status: response.status, tentativa: attempt + 1 });
    await pause(retryDelay(attempt, response.headers.get('retry-after')));
  }
  throw new SafeError('Tentativas esgotadas');
}
