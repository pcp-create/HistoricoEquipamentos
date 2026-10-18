/** Reuse the same receipt ID when a response is lost, avoiding duplicate attachments. */
export async function uploadReportPhoto(form: FormData, send: typeof fetch = fetch, retry = true): Promise<string> {
  if (!form.has('requestId')) form.set('requestId', crypto.randomUUID());
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await send('/api/service-scheduling/photos', {method:'POST',body:form,signal:AbortSignal.timeout(90000)});
    } catch {
      if (retry && attempt === 0) continue;
      throw Error('Não foi possível enviar a foto. Verifique a conexão e tente novamente.');
    }
    const result = await response.json().catch(() => null);
    if (response.ok && result?.id && /^(?:\d+|local-[0-9a-f-]+)$/.test(String(result.id))) return String(result.id);
    if (retry && attempt === 0 && (response.status >= 500 || response.status === 429 || (response.ok && !result?.id))) continue;
    throw Error(result?.error || 'O servidor não confirmou o envio da foto. Tente novamente.');
  }
}
