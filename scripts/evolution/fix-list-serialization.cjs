// Correção local para o bundle Evolution 2.3.7 observado; não envia mensagens.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function patchSource(source) {
  const marker = 'patchMessageBeforeSending(';
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0)
    throw Error('Função ausente ou ambígua. Nenhuma alteração aplicada.');
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (end < source.length && depth) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  if (depth) throw Error('Função incompleta.');
  const block = source.slice(start, end);
  const argument = /^patchMessageBeforeSending\(([$\w]+)\)/.exec(block)?.[1];
  const proto = /([$\w]+)\.proto\.Message\.ListMessage\.ListType\.SINGLE_SELECT/.exec(block)?.[1];
  if (!argument || !proto) throw Error('Bundle diferente do analisado.');
  const old = `JSON.parse(JSON.stringify(${argument}))`;
  const replacement = `${proto}.proto.Message.decode(${proto}.proto.Message.encode(${argument}).finish())`;
  const count = block.split(old).length - 1;
  if (!count && block.split(replacement).length - 1 === 2) return source;
  if (count !== 2) throw Error('Esperadas exatamente duas cópias JSON. Nenhuma alteração aplicada.');
  return source.slice(0, start) + block.split(old).join(replacement) + source.slice(end);
}

async function verifyProto(proto) {
  const original = proto.Message.fromObject({listMessage:{
    title:'Teste DSU',description:'Validação local, sem envio',buttonText:'Ver opções',
    listType:proto.Message.ListMessage.ListType.PRODUCT_LIST,
    sections:[{title:'Menu',rows:[{title:'Tarefas',rowId:'dsu-test'}]}],
    contextInfo:{ephemeralSettingTimestamp:'1791489950'}
  }});
  const timestamp = original.listMessage.contextInfo.ephemeralSettingTimestamp;
  original.listMessage.contextInfo.ephemeralSettingTimestamp = {low:timestamp.low,high:timestamp.high,unsigned:timestamp.unsigned};
  let failed = false;
  try { JSON.stringify(original); } catch (e) { failed = /isZero/.test(e.message); }
  if (!failed) throw Error('A biblioteca não reproduziu o problema esperado; interrompendo por segurança.');
  for (const message of [original, proto.Message.create({deviceSentMessage:{destinationJid:'test',message:original}})]) {
    const fixed = proto.Message.decode(proto.Message.encode(message).finish());
    JSON.stringify(fixed);
    const list = fixed.listMessage || fixed.deviceSentMessage.message.listMessage;
    if (list.sections[0].rows[0].rowId !== 'dsu-test' || list.contextInfo.ephemeralSettingTimestamp.toString() !== '1791489950')
      throw Error('Validação dos dados falhou.');
  }
}

async function main() {
  const file = '/evolution/dist/main.js';
  const { proto } = await import(pathToFileURL('/evolution/node_modules/baileys/WAProto/index.js').href);
  await verifyProto(proto);
  const source = fs.readFileSync(file,'utf8');
  const patched = patchSource(source);
  if (source === patched) { console.log('Correção já aplicada.'); return; }
  const hash = createHash('sha256').update(source).digest('hex').slice(0,12);
  const backup = `${file}.before-dsu-${hash}`;
  const temporary = path.join(path.dirname(file),`.dsu-main-${process.pid}.js`);
  try {
    fs.writeFileSync(temporary,patched,{flag:'wx',mode:fs.statSync(file).mode});
    execFileSync(process.execPath,['--check',temporary],{stdio:'pipe'});
    if (fs.existsSync(backup)) {
      if (fs.readFileSync(backup,'utf8') !== source) throw Error('Backup existente diverge.');
    } else fs.writeFileSync(backup,source,{flag:'wx',mode:0o600});
    fs.renameSync(temporary,file);
    console.log('Correção aplicada e sintaxe validada. Backup: '+backup);
    console.log('Reinicie somente o container Evolution para carregar o código.');
  } finally { if(fs.existsSync(temporary))fs.unlinkSync(temporary); }
}
module.exports={patchSource,verifyProto};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
