// Exportações privadas permanecem em .m8, ignorado pelo Git.
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const source = ".m8/My workflow.json";
const target = ".m8/My workflow — DSU integrado.json";
const original = JSON.parse(readFileSync(source, "utf8"));
const dsu = JSON.parse(
  readFileSync(".m8/Assistente RJ (DSU) — WhatsApp e tarefas.json", "utf8"),
);
const workflow = structuredClone(original);
const webhook = workflow.nodes.find(
  (n) =>
    n.type === "n8n-nodes-base.webhook" &&
    n.parameters.path === "evolution" &&
    n.parameters.httpMethod === "POST",
);
if (!webhook) throw Error("Webhook POST evolution não encontrado");
if (workflow.nodes.some((n) => n.name.startsWith("DSU —")))
  throw Error("O arquivo de origem já contém DSU");
const originalEdges = structuredClone(
  workflow.connections[webhook.name].main[0],
);
const byName = Object.fromEntries(dsu.nodes.map((n) => [n.name, n]));
// A entrada autenticada impede que terceiros forjem o telefone de um colaborador.
webhook.parameters.authentication = "headerAuth";
webhook.parameters.responseMode = "onReceived";
webhook.credentials = structuredClone(byName["Responder WhatsApp"].credentials);
if (!webhook.credentials?.httpHeaderAuth)
  throw Error("Credencial Evolution ausente");
const added = [];
function node(name, type, parameters, position, typeVersion = 2) {
  const n = {
    id: randomUUID(),
    name,
    type: `n8n-nodes-base.${type}`,
    typeVersion,
    parameters,
    position,
  };
  added.push(n);
  return n;
}
node(
  "DSU — Roteamento",
  "code",
  {
    jsCode: `// Somente mensagens privadas recebidas pela BotDemandas seguem para o DSU.
return $input.all().flatMap((item,i)=>{
 const b=item.json.body, key=b?.data?.key;
 if(b?.instance==='BotDemandas' && key?.fromMe===true) return [];
 const jid=typeof key?.remoteJid==='string' ? key.remoteJid : '';
 const alt=typeof key?.remoteJidAlt==='string' ? key.remoteJidAlt : '';
 const privateMessage=jid.endsWith('@s.whatsapp.net') || (jid.endsWith('@lid') && alt.endsWith('@s.whatsapp.net'));
 const dsu=b?.instance==='BotDemandas' && ['messages.upsert','MESSAGES_UPSERT'].includes(b?.event) && key?.fromMe===false && privateMessage;
 return [{json:{...item.json,dsu},pairedItem:{item:i}}];
});`,
  },
  [240, -400],
);
const conditions = (leftValue, type, operation, rightValue) => ({
  conditions: {
    options: {
      caseSensitive: true,
      leftValue: "",
      typeValidation: "strict",
      version: 2,
    },
    conditions: [
      {
        id: randomUUID(),
        leftValue,
        rightValue,
        operator: { type, operation },
      },
    ],
    combinator: "and",
  },
  options: {},
});
node(
  "DSU — Conversa privada?",
  "if",
  conditions("={{ $json.dsu }}", "boolean", "true", ""),
  [480, -400],
  2.2,
);
const mapNames = {};
for (const name of [
  "Configuração",
  "Processar conversa",
  "Preparar respostas",
  "Responder WhatsApp",
])
  mapNames[name] = "DSU — " + name;
for (const [name, newName] of Object.entries(mapNames)) {
  const copy = structuredClone(byName[name]);
  copy.id = randomUUID();
  copy.name = newName;
  copy.position = [720 + Object.keys(mapNames).indexOf(name) * 260, -600];
  if (copy.parameters.jsCode)
    for (const [oldName, replacement] of Object.entries(mapNames))
      copy.parameters.jsCode = copy.parameters.jsCode.replaceAll(
        `$('${oldName}')`,
        `$('${replacement}')`,
      );
  if (name === "Configuração")
    copy.parameters.jsCode = copy.parameters.jsCode.replace(
      "payload:{instance:",
      "payload:{legacyRouting:true,instance:",
    );
  // Uma falha posterior no legado deve ser revisada, não repetir uma gravação DM.
  if (name === "Processar conversa") copy.retryOnFail = false;
  added.push(copy);
}
node(
  "DSU — Validar resultado",
  "code",
  {
    jsCode: `const data=$input.first().json;
if(!Array.isArray(data.replies)) throw new Error('A API DSU não retornou JSON válido. Confira a publicação de /api/dsu e a credencial Authorization.');
return $input.all();`,
  },
  [1240, -840],
);
node(
  "DSU — Demanda antiga?",
  "if",
  conditions('={{ $json.route || "dsu" }}', "string", "equals", "legacy"),
  [1480, -840],
  2.2,
);
node(
  "DSU — Restaurar mensagem",
  "code",
  {
    jsCode: `return [{json:$(${JSON.stringify(webhook.name)}).first().json}];`,
  },
  [1740, -1040],
);
node(
  "DSU — Implantação",
  "stickyNote",
  {
    content: `## Um único webhook: POST /webhook/evolution
Atualizar My workflow; manter o workflow DSU separado inativo.

Preservados os nós e conexões antigos. Grupos e outras instâncias seguem o ramo antigo. Conversas privadas da BotDemandas seguem o DSU; comandos DM e listar/@responsável retornam ao legado fora do preenchimento de uma tarefa. Sem envio aos dois ramos simultaneamente.

ANTES DE PUBLICAR:
1. Publicar o backend /api/dsu atualizado, incluindo legacyRouting.
2. Conferir DSU — Processar conversa: Authorization: Bearer <DSU_AUTOMATION_TOKEN>.
3. O Webhook agora exige a credencial Evolution. Configurar header HTTP apikey no webhook da Evolution com o mesmo valor. A apikey no corpo JSON não autentica.
4. Manter MESSAGES_UPSERT habilitado e Webhook by Events desligado.
5. Testar Menu no privado e um comando antigo autorizado. Não executar envios manualmente sem conferir entrega.

A origem foi preservada em .m8/My workflow.json. Este arquivo contém dados privados da exportação e não deve ir para o Git.`,
    height: 640,
    width: 620,
  },
  [200, -1200],
  1,
);
workflow.nodes.push(...added);
const edge = (name) => ({ node: name, type: "main", index: 0 });
const connect = (name, outputs) => {
  workflow.connections[name] = { main: outputs };
};
connect(webhook.name, [[edge("DSU — Roteamento")]]);
connect("DSU — Roteamento", [[edge("DSU — Conversa privada?")]]);
connect("DSU — Conversa privada?", [
  [edge("DSU — Configuração")],
  originalEdges,
]);
connect("DSU — Configuração", [[edge("DSU — Processar conversa")]]);
connect("DSU — Processar conversa", [[edge("DSU — Validar resultado")]]);
connect("DSU — Validar resultado", [[edge("DSU — Demanda antiga?")]]);
connect("DSU — Demanda antiga?", [
  [edge("DSU — Restaurar mensagem")],
  [edge("DSU — Preparar respostas")],
]);
connect("DSU — Restaurar mensagem", [originalEdges]);
connect("DSU — Preparar respostas", [[edge("DSU — Responder WhatsApp")]]);
workflow.active = false;
// Não incluir mensagens fixadas ou versões publicadas antigas na importação.
workflow.pinData = {};
delete workflow.activeVersion;
delete workflow.activeVersionId;
workflow.settings = {
  ...workflow.settings,
  saveDataSuccessExecution: "none",
  saveDataErrorExecution: "none",
  saveManualExecutions: false,
};
writeFileSync(target, JSON.stringify(workflow, null, 2) + "\n", {
  mode: 0o600,
});
console.log(
  `Fluxo integrado gerado em ${target}. Origem preservada; publicação manual pendente.`,
);
