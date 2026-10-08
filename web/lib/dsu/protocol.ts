export type Incoming = {
  instance: string;
  phone: string;
  id: string;
  text: string;
};
export function phoneKey(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  // A representação antiga de celulares brasileiros pode omitir o nono dígito.
  if (/^55\d{2}9[6-9]\d{7}$/.test(digits))
    digits = digits.slice(0, 4) + digits.slice(5);
  return digits;
}
export function incomingEvent(
  body: any,
  instance: string,
  now = Date.now(),
): Incoming | null {
  if (
    !body ||
    body.instance !== instance ||
    !["messages.upsert", "MESSAGES_UPSERT"].includes(body.event)
  )
    return null;
  const data = body.data,
    key = data?.key;
  if (
    !key ||
    key.fromMe !== false ||
    typeof key.id !== "string" ||
    key.id.length > 200
  )
    return null;
  // Não aceitar grupos, broadcasts ou LIDs como números de telefone.
  const remote = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const alternate =
    typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : "";
  const jid = remote.endsWith("@s.whatsapp.net")
    ? remote
    : remote.endsWith("@lid") && alternate.endsWith("@s.whatsapp.net")
      ? alternate
      : "";
  if (!/^\d{10,15}@s\.whatsapp\.net$/.test(jid)) return null;
  const timestamp = Number(data.messageTimestamp);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(now - timestamp * 1000) > 15 * 60 * 1000
  )
    return null;
  const m = messageContent(data.message);
  if (!m) return null;
  let native = "";
  try {
    native =
      JSON.parse(
        m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
          "{}",
      ).id || "";
  } catch {}
  const text =
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    native ||
    m.conversation ||
    m.extendedTextMessage?.text ||
    (body.legacyRouting === true &&
      (m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        m.documentMessage?.fileName));
  if (typeof text !== "string" || !text.trim() || text.length > 12000)
    return null;
  return { instance, phone: jid.split("@")[0], id: key.id, text: text.trim() };
}
export function dueDate(value: string, now = new Date()): string | null {
  const today = now.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const input = value.trim().toLowerCase();
  if (["hoje", "amanhã", "amanha"].includes(input)) {
    const day = new Date(today + "T12:00:00Z");
    if (input !== "hoje") day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(iso + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

// Reconhece somente a sintaxe que já era tratada no workflow de demandas DM.
export function legacyDemandCommand(body: any, text: string): boolean {
  if (
    /^listar(?:\s+@[^\s]+)?$/i.test(text) ||
    /^(?:concluir|reabrir|original)\s+DM-?\d+$/i.test(text)
  )
    return true;
  if (/@([a-zA-ZÀ-ÿ0-9._-]+)/.test(text)) return true;
  const m = messageContent(body?.data?.message);
  const context =
    m?.extendedTextMessage?.contextInfo ||
    m?.imageMessage?.contextInfo ||
    m?.videoMessage?.contextInfo ||
    m?.documentMessage?.contextInfo ||
    m?.contextInfo ||
    body?.data?.contextInfo;
  const mentions = context?.mentionedJid || context?.mentionedJids;
  return Array.isArray(mentions)
    ? mentions.length > 0
    : typeof mentions === "string" && mentions.length > 0;
}

function messageContent(message: any): any {
  let m = message;
  for (let i = 0; i < 4 && m; i++) {
    const nested =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message;
    if (!nested) break;
    m = nested;
  }
  return m;
}
