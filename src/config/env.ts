import 'dotenv/config';
import { DEFAULT_M8_TIME_ZONE, validateTimeZone } from '../utils/m8Dates.js';

export type Env = Record<string, string | undefined>;
export function required(env: Env, key: string): string {
  const value = env[key];
  if (!value?.trim()) throw new Error(`Variável obrigatória ausente: ${key}`);
  return value;
}
export function integer(value: string | undefined, fallback: number, key: string, max = 2147483647): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new Error(`${key} deve ser inteiro entre 1 e ${max}`);
  return Number(value);
}
export function m8Config(env: Env = process.env) {
  const normalize = (value: string) => value.replace(/\/+$/, '');
  if (env.M8_API_URL && env.M8_BASE_URL && normalize(env.M8_API_URL) !== normalize(env.M8_BASE_URL)) {
    throw new Error('M8_API_URL e M8_BASE_URL divergem');
  }
  const baseUrl = normalize(env.M8_API_URL || env.M8_BASE_URL || 'https://api.integra.m8sistemas.com.br');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('M8_API_URL deve ser a origem HTTPS sem caminho, credenciais ou parâmetros');
  }
  const rawCompanies = env.M8_COMPANIES?.trim() || env.M8_COMPANY?.trim() || '1,2,27404';
  const companies = [...new Set(rawCompanies.split(',').map(value => integer(value.trim(), 0, 'M8_COMPANIES')))];
  if (companies.some(company => company === 0)) throw new Error('M8_COMPANIES contém item vazio');
  return {
    baseUrl, companies,
    timeZone: validateTimeZone(env.M8_TIME_ZONE?.trim() || DEFAULT_M8_TIME_ZONE),
    tenant: required(env, 'M8_TENANT'), username: required(env, 'M8_USERNAME'), password: required(env, 'M8_PASSWORD'),
    domain: env.M8_DOMAIN?.trim() || 'app.erpm8.cloud',
    tokenPath: env.M8_TOKEN_PATH?.trim() || 'data.token',
    timeoutMs: integer(env.M8_TIMEOUT_MS, 30000, 'M8_TIMEOUT_MS', 300000),
    maxAttempts: integer(env.M8_MAX_ATTEMPTS, 4, 'M8_MAX_ATTEMPTS', 10),
    maxResponseBytes: integer(env.M8_MAX_RESPONSE_MB, 64, 'M8_MAX_RESPONSE_MB', 512) * 1024 * 1024,
    pageSize: integer(env.M8_PAGE_SIZE, 500, 'M8_PAGE_SIZE', 500),
  };
}
export type M8Config = ReturnType<typeof m8Config>;
