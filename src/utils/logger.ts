// Only locally authored messages/metadata are emitted. Never log API bodies or raw errors.
export function log(scope: string, message: string, metadata: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), scope, message, ...metadata }));
}
export class SafeError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
export function safeError(error: unknown): string {
  if (error instanceof SafeError) return error.message;
  // PostgreSQL errors can contain full records, credentials or URLs in detail/message.
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return /^[A-Z0-9_]{2,32}$/.test(code) ? `Falha operacional (${code}); consulte documentação de diagnóstico` : 'Falha operacional; verifique configuração e formato do retorno';
}
