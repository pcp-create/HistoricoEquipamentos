import type { M8Config } from '../config/env.js';
import { log, SafeError } from '../utils/logger.js';
import { requestWithRetry, type Sleep, type Transport, sleep } from '../utils/retry.js';

export function atPath(value: unknown, path: string): unknown {
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
// One instance per company. The shared promise prevents an authentication stampede.
export class M8Auth {
  private token?: string;
  private obtainedAt = 0;
  private expiresAt = 0;
  private authenticationPromise?: Promise<string>;
  constructor(private config: M8Config, readonly company: number, private transport: Transport = fetch,
    private now = Date.now, private pause: Sleep = sleep) {}

  invalidate(rejectedToken: string) {
    // A late 401 for the old token must not invalidate a newer token.
    if (this.token === rejectedToken) this.token = undefined;
  }
  async getToken(): Promise<string> {
    if (this.token && this.now() - this.obtainedAt < 300000 && this.now() < this.expiresAt - 30000) return this.token;
    if (!this.authenticationPromise) {
      this.authenticationPromise = this.authenticate().finally(() => { this.authenticationPromise = undefined; });
    }
    return this.authenticationPromise;
  }
  private async authenticate(): Promise<string> {
    log('M8', 'Autenticando', { company: this.company });
    const response = await requestWithRetry(`${this.config.baseUrl}/v1/auth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        tenant: this.config.tenant, username: this.config.username, password: this.config.password,
        company: this.company, domain: this.config.domain,
      }),
    }, this.config, this.transport, this.pause);
    if (!response.ok) throw new SafeError(`Autenticação /v1/auth/token: HTTP ${response.status} (corpo omitido para proteger credenciais)`, response.status);
    let body: unknown;
    try { body = await response.json(); } catch { throw new SafeError('Autenticação retornou JSON inválido'); }
    const errors = atPath(body, 'errors');
    if (errors != null && (!Array.isArray(errors) || errors.length > 0)) throw new SafeError('Autenticação retornou errors (conteúdo omitido)');
    const token = atPath(body, this.config.tokenPath);
    if (typeof token !== 'string' || !token.trim()) throw new SafeError('Formato de token não reconhecido; confirme M8_TOKEN_PATH na documentação/retorno real');
    this.obtainedAt = this.now();
    this.expiresAt = this.obtainedAt + 360000;
    // JWT exp is a scheduling hint only; it is not used to verify authenticity.
    try {
      const part = token.split('.')[1];
      const claims: unknown = JSON.parse(Buffer.from(part || '', 'base64url').toString());
      const exp = atPath(claims, 'exp');
      if (typeof exp === 'number' && Number.isFinite(exp)) this.expiresAt = Math.min(this.expiresAt, exp * 1000);
    } catch { /* opaque tokens use the conservative six-minute lifetime */ }
    if (this.expiresAt <= this.now() + 30000) throw new SafeError('Token recebido já expirado ou próximo da expiração; verificar relógio/contrato M8');
    this.token = token;
    log('M8', 'Token obtido com sucesso', { company: this.company });
    return token;
  }
}
