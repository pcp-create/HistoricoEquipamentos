// Código do nó “DSU — Preparar respostas” (Run Once for All Items).
const result = $input.first().json;
if (!Array.isArray(result.replies)) throw new Error('A API DSU não retornou replies. Confira o nó Processar conversa.');
const cfg = $('DSU — Configuração').first().json;
return result.replies.map((reply) => {
  const body = reply.body;
  if (!body || !['sendText', 'sendList', 'sendButtons'].includes(reply.endpoint)) throw new Error('Resposta DSU inválida.');
  let text = body.text;
  if (reply.endpoint !== 'sendText') {
    const options = reply.endpoint === 'sendList'
      ? (body.sections || []).flatMap(section => section.rows || []).map(row => ({title: row.title, description: row.description}))
      : (body.buttons || []).map(button => ({title: button.displayText}));
    if (!options.length) throw new Error('Menu DSU sem opções.');
    text = [body.title ? `*${body.title}*` : null, body.description, options.map((option, i) => `*${i + 1} — ${option.title}*${option.description && option.description !== option.title ? `\n   ${option.description}` : ''}`).join('\n'), 'Responda com o número da opção.\nDigite *Menu* ou *Cancelar* para voltar.'].filter(Boolean).join('\n\n');
  }
  if (typeof text !== 'string' || !text.trim()) throw new Error('Resposta DSU sem texto.');
  text = text.replace(/^Assistente RJ \(DSU\)$/gm, '*Assistente RJ (DSU)*').replace(/^(\d+ — [^\n]+)$/gm, '*$1*');
  return {json: {evolutionUrl: cfg.evolutionUrl, instance: cfg.instance, endpoint: 'sendText', body: {number: body.number, text}}, pairedItem: {item: 0}};
});
