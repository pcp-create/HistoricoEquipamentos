import type { M8Config } from '../config/env.js';
import { SafeError } from '../utils/logger.js';
import { requestWithRetry, type Sleep, type Transport, sleep } from '../utils/retry.js';
import { M8Auth } from './auth.js';
export class M8Client {
  private auth: M8Auth;
  get timeZone() { return this.config.timeZone; }
  constructor(private config: M8Config, readonly company: number, private transport: Transport = fetch, private pause: Sleep = sleep) {
    this.auth = new M8Auth(config, company, transport, Date.now, pause);
  }
  async get(path: string, params: Record<string, string | number | boolean>): Promise<unknown> {
    return this.getMany(path, params);
  }
  async getMany(path: string, params: Record<string, string | number | boolean | readonly (string | number)[]>): Promise<unknown> {
    if (!path.startsWith('/v1/') || path.includes('..')) throw new SafeError('Endpoint M8 inválido');
    const url = new URL(this.config.baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    for (let replay = 0; replay < 2; replay++) {
      const token = await this.auth.getToken();
      const response = await requestWithRetry(url.toString(), { headers: { Authorization: `Bearer ${token}` } }, this.config, this.transport, this.pause);
      if (response.status === 401 && replay === 0) { this.auth.invalidate(token); continue; }
      if (!response.ok) throw new SafeError(`Consulta ${path}: HTTP ${response.status} (corpo omitido)`, response.status);
      try { return await response.json(); } catch { throw new SafeError(`JSON inválido em ${path}`); }
    }
    throw new SafeError(`HTTP 401 persistente em ${path}`, 401);
  }
}
