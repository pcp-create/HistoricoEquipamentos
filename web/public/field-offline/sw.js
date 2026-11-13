/* Offline technician portal. Queue writes and projections commit atomically. */
importScripts("/field-offline/project.js");
const DB = "rj-field-offline-v1",
  ASSETS = "rj-field-assets-v1";
let serial = Promise.resolve(),
  flushing = null, syncingId = null, retryTimer = null, retryAttempt = 0;
const exclusive = (fn) => {
  const next = serial.then(fn, fn);
  serial = next.catch(() => {});
  return next;
};
const json = (v, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("records", { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function read(key) {
  if (self.nativeStorage) return self.nativeStorage.read(key);
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("records"),
      r = t.objectStore("records").get(key);
    r.onsuccess = () => resolve(r.result?.value);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => d.close();
  });
}
async function write(entries) {
  if (self.nativeStorage) return self.nativeStorage.write(entries);
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("records", "readwrite"),
      s = t.objectStore("records");
    for (const [key, value] of entries)
      value === undefined ? s.delete(key) : s.put({ key, value });
    t.oncomplete = () => {
      d.close();
      resolve();
    };
    t.onabort = () => {
      d.close();
      reject(t.error || Error("Não foi possível salvar no dispositivo."));
    };
  });
}
const key = (owner, url) => owner + ":cache:" + url;
async function request(url, init = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(init.body instanceof FormData ? 90000 : 15000),
  });
}
async function notify() {
  for (const c of await self.clients.matchAll({ type: "window" }))
    c.postMessage({ type: "field-offline-update" });
}
async function registerSync() {
  try {
    await self.registration.sync?.register("rj-field-sync");
  } catch {}
}
function replaceIds(value, mapping) {
  if (typeof value === "string") return mapping[value] || value;
  if (Array.isArray(value)) return value.map((v) => replaceIds(v, mapping));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceIds(v, mapping)]),
    );
  return value;
}
function localReferences(value,ids=new Set()){
  if(typeof value==='string'&&value.startsWith('local-'))ids.add(value.slice(6));
  else if(value&&typeof value==='object')for(const nested of Object.values(value))localReferences(nested,ids);
  return ids;
}
const timerActions = new Set(['start_work','start_travel','pause','resume','stop']);
const isTimer = item => item.type==='action'&&timerActions.has(item.body?.action);
// Timers belong to the technician, not just one OS. Legacy queues did not record
// cross-operation dependencies or the work session required by queued photos.
function queueDependencies(queue){
  const result=new Map(),activations=new Map();let previousTimer;
  const pending=new Set(queue.map(item=>item.id));
  for(const item of queue){
    const dependencies=new Set();
    const previous=item.body?.offline?.previousRequestId;
    if(pending.has(previous))dependencies.add(previous);
    for(const id of localReferences(item.body))if(id!==item.id&&pending.has(id))dependencies.add(id);
    if(isTimer(item)){
      if(previousTimer)dependencies.add(previousTimer);
      previousTimer=item.id;
      if(['start_work','resume'].includes(item.body.action))activations.set(item.operationId,item.id);
    }
    if(item.type==='photo'&&activations.has(item.operationId))dependencies.add(activations.get(item.operationId));
    result.set(item.id,dependencies);
  }
  return result;
}
function dependentIds(queue,id,dependencies=queueDependencies(queue)){
  const ids=new Set([id]);let changed=true;
  while(changed){changed=false;for(const item of queue)if(!ids.has(item.id)&&[...dependencies.get(item.id)].some(previous=>ids.has(previous))){ids.add(item.id);changed=true;}}
  ids.delete(id);return ids;
}
function queueBlockers(queue,dependencies=queueDependencies(queue)){
  const blocked=new Map();
  for(const failed of queue.filter(item=>item.error||item.discardedDependency))for(const id of dependentIds(queue,failed.id,dependencies))if(!blocked.has(id))blocked.set(id,'Depende de um registro com falha. Os registros independentes continuam sincronizando.');
  return blocked;
}
function recoverableFailure(item){
  return item.retryable===true
    || (item.type==='action'&&!!item.body?.offline&&item.error==='Conflito: a operação foi alterada no sistema. Os dados offline foram preservados para conferência.')
    || (isTimer(item)&&item.error==='Finalize o apontamento em andamento antes de iniciar outro.')
    || (['photo','action'].includes(item.type)&&item.error==='Inicie ou retome a atividade desta operação para preencher o relatório técnico.');
}
// Server receipts are authoritative even when a local predecessor was discarded.
async function reconcileReceipts(owner){
 const queue=(await read(owner+':queue'))||[];
 if(!queue.length||!queue.some(item=>item.discardedDependency))return;
 const archive=(await read(owner+':discardedQueue'))||[];
 const candidates=[...archive,...queue];
 const ids=[...new Set(candidates.map(item=>item.id))];
 const receipts=[];
 for(let offset=0;offset<ids.length;offset+=200){
  const response=await request('/api/field?receipts='+encodeURIComponent(ids.slice(offset,offset+200).join(',')));
  if(!response.ok)return;
  const body=await response.json();
  if(body.email!==owner||!Array.isArray(body.receipts))return;
  receipts.push(...body.receipts);
 }
 await exclusive(async()=>{
  if((await read('owner'))!==owner)return;
  const current=(await read(owner+':queue'))||[],discarded=(await read(owner+':discardedQueue'))||[];
  const all=[...discarded,...current].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const confirmed=new Map(receipts.filter(r=>all.some(q=>q.id===r.id&&q.operationId===r.operationId&&q.type===r.type)&&(r.type!=='photo'||/^\d+$/.test(String(r.photoId)))).map(r=>[r.id,r]));
  const dependencies=queueDependencies(all),archived=new Set(discarded.map(q=>q.id));
  function roots(id,seen=new Set(),found=new Set()){
   if(seen.has(id))return found;seen.add(id);
   if(archived.has(id))found.add(id);
   for(const previous of dependencies.get(id)||[])roots(previous,seen,found);
   return found;
  }
  const mapping=(await read(owner+':mapping'))||{},heads=(await read(owner+':heads'))||{};
  const remaining=[];
  for(const item of current){
   const receipt=confirmed.get(item.id);
   if(receipt){if(item.type==='photo')mapping['local-'+item.id]=receipt.photoId;else if(item.type==='action')heads[item.operationId]=item.id;continue;}
   const ancestors=[...roots(item.id)];
   if(item.discardedDependency&&ancestors.length&&ancestors.every(id=>confirmed.has(id))){
    delete item.discardedDependency;delete item.error;delete item.failedPermanent;item.retryable=true;
   }
   remaining.push(item);
  }
  await write([[owner+':queue',remaining],[owner+':mapping',mapping],[owner+':heads',heads],...(remaining.length<current.length?[[owner+':lastSync',new Date().toISOString()],[owner+':unrefreshed',true]]:[])]);
 });
}
async function retryPending(id){
  const owner=await read('owner');if(!owner)throw Error('Entre no portal primeiro.');
  // An automatic flush can start after the panel enabled the button. Wait for it
  // instead of rejecting the user's retry; recheck under the queue lock.
  let prepared=false;
  while(!prepared){
    if(flushing)await flushing.catch(()=>{});
    prepared=await exclusive(async()=>{
      if(flushing)return false;
      if((await read('owner'))!==owner)throw Error('Conta alterada. Entre com a conta das pendências.');
      const queue=(await read(owner+':queue'))||[],item=queue.find(value=>value.id===id);
      if(!item)return true; // The automatic flush already acknowledged this item.
      if(item.discardedDependency||queueBlockers(queue).has(id))throw Error('Reprocesse primeiro o registro anterior que está com falha.');
      if(!item.error)throw Error('Selecione um registro com falha.');
      // Preserve request IDs, original data and version checks.
      delete item.failedPermanent;delete item.error;item.retryable=true;
      await write([[owner+':queue',queue]]);return true;
    });
  }
  await notify();
  await sync();
}
async function discardPending(id,includeDependents=false){
  if(flushing)throw Error('Aguarde a sincronização terminar antes de excluir.');
  await exclusive(async()=>{
    if(flushing)throw Error('Aguarde a sincronização terminar antes de excluir.');
    const owner=await read('owner');if(!owner)throw Error('Entre no portal primeiro.');
    const queue=(await read(owner+':queue'))||[],item=queue.find(v=>v.id===id),blockers=queueBlockers(queue);
    if(!item||(!item.error&&!item.discardedDependency&&!blockers.has(id)))throw Error('Selecione um registro com falha ou bloqueado por uma falha.');
    const dependents=dependentIds(queue,id),removed=new Set([id,...(includeDependents?dependents:[])]),remaining=queue.filter(v=>!removed.has(v.id));
    if(!includeDependents)for(const pending of remaining)if(dependents.has(pending.id)){pending.discardedDependency=true;pending.error='O registro anterior foi excluído. Confira estes dados antes de reenviar ou excluir esta pendência.';pending.retryable=false;}
    // Keep a recoverable copy of what was explicitly removed, including photos.
    const archive=(await read(owner+':discardedQueue'))||[];
    await write([[owner+':discardedQueue',[...archive,...queue.filter(v=>removed.has(v.id)).map(v=>({...v,discardedAt:new Date().toISOString()}))]],[owner+':queue',remaining],[owner+':unrefreshed',true]]);
  });
  await notify();
}
async function status() {
  const owner = await read("owner"),
    queue = owner ? ((self.nativeStorage?.readMetadata ? await self.nativeStorage.readMetadata(owner + ":queue") : await read(owner + ":queue")) || []) : [];
  const dependencies=queueDependencies(queue),blockers=queueBlockers(queue,dependencies);
  return {
    owner,
    syncing: !!flushing,
    syncingId,
    connected:
      self.navigator.onLine !== false && (await read("connected")) === true,
    pending: queue.length,
    queue: queue.map((q) => ({
      id: q.id,
      action: q.type === "photo" ? "Foto / assinatura" : q.body.action,
      operationId: q.operationId,
      operationLabel: q.operationLabel,
      at: q.at,
      error: q.error,
      blockedReason:q.discardedDependency?q.error:blockers.get(q.id),
      dependents:dependentIds(queue,q.id,dependencies).size,
      canRetry:!!q.error&&!q.discardedDependency&&!blockers.has(q.id),
    })),
    lastSync: owner ? await read(owner + ":lastSync") : null,
    prepared: owner ? await read(owner + ":prepared") : null,
    discarded:owner?((await read(owner+':discardedQueue'))||[]).length:0,
  };
}
// Refresh unrelated operations without replacing local work still awaiting acknowledgement.
function mergePendingHome(server,local,queue){
  if(!local)return server;
  const protectedIds=new Set(queue.map(item=>item.operationId));
  const rows=(remote=[],saved=[])=>[...remote.filter(row=>!protectedIds.has(row.id)),...saved.filter(row=>protectedIds.has(row.id))];
  const protectActive=protectedIds.has(local.active?.operation_id)||protectedIds.has(server.active?.operation_id);
  return {...server,rows:rows(server.rows,local.rows),...(server.calendarRows||local.calendarRows?{calendarRows:rows(server.calendarRows||server.rows,local.calendarRows||local.rows)}:{}),active:protectActive?local.active||null:server.active};
}
const queueMetadata=async owner=>(self.nativeStorage?.readMetadata?await self.nativeStorage.readMetadata(owner+':queue'):await read(owner+':queue'))||[];
async function refreshScheduling(owner,home,force=false){
  if(!home){const response=await request('/api/field');if(!response.ok)throw Error('Não foi possível atualizar a programação.');home=await response.json();}
  if(home.email!==owner)throw Error('Conta alterada.');
  const pending=await queueMetadata(owner),protectedIds=new Set(pending.map(item=>item.operationId)),initialIds=new Set(pending.map(item=>item.id)),snapshots=[];
  let complete=true;
  const rows=new Map([...(home.rows||[]),...(home.calendarRows||[])].map(row=>[row.id,row]));
  for(const row of rows.values()){
    if((await queueMetadata(owner)).some(item=>!initialIds.has(item.id)&&!item.error)){complete=false;break;}
    if(protectedIds.has(row.id))continue;
    if((await read('owner'))!==owner)throw Error('Conta alterada.');
    const url='/api/field?operation='+row.id,cached=await read(key(owner,url));
    if(!force&&cached?.operation?.version!=null&&row.version===cached.operation.version)continue;
    try{const response=await request(url);if(!response.ok)throw Error('Operação indisponível.');const detail=await response.json();if(detail.operation?.id!==row.id)throw Error('Operação inválida.');snapshots.push([row.id,url,detail]);}catch{complete=false;}
  }
  let logs;
  if(!pending.length){const response=await request('/api/field/time-requests');if(response.ok)logs=await response.json();}
  await exclusive(async()=>{
    if((await read('owner'))!==owner)throw Error('Conta alterada.');
    const currentQueue=await queueMetadata(owner),currentIds=new Set(currentQueue.map(item=>item.operationId)),local=await read(key(owner,'/api/field'));
    const entries=[[key(owner,'/api/field'),mergePendingHome(home,local,currentQueue)],[owner+':server-home',home],['connected',true],[owner+':unrefreshed',!complete]];
    for(const [id,url,detail]of snapshots)if(!currentIds.has(id))entries.push([key(owner,url),detail]);
    if(logs&&!currentQueue.length)entries.push([key(owner,'/api/field/time-requests'),logs]);
    if(complete)entries.push([owner+':prepared',new Date().toISOString()]);
    await write(entries);
  });
  await notify();
}
async function cacheGet(url) {
  const owner = await read("owner");
  // A pending projection must not be replaced by stale server state.
  const pending=owner?await queueMetadata(owner):[];
  const operationId=new URL(url,'https://portal.local').searchParams.get('operation');
  if(owner&&pending.length&&(url==='/api/field'||url==='/api/field/time-requests'||pending.some(item=>item.operationId===operationId))) {
    const saved = await read(key(owner, url));
    if (saved) return json(saved);
  }
  try {
    const response = await request(url);
    if (response.status === 401 || response.status === 403) return response;
    if (!response.ok) throw Error("Servidor indisponível.");
    const body = await response.clone().json();
    const identity = url === "/api/field" ? body.email : owner;
    if (url === "/api/field" && body.email) await write([[body.email + ":server-home", body]]);
    if (identity) {
      const pending = (await read(identity + ":queue")) || [];
      if (url === "/api/field" && pending.length) {
        const projected = await read(key(identity, url));
        await write([
          ["owner", identity],
          ["connected", true],
        ]);
        if(projected){const merged=mergePendingHome(body,projected,pending);await write([[key(identity,url),merged]]);return json(merged);}
      }
      await write([
        ["owner", identity],
        [key(identity, url), body],
        ["connected", true],
      ]);
    }
    return response;
  } catch {
    await write([["connected", false]]);
    const saved = owner ? await read(key(owner, url)) : null;
    return saved
      ? json(saved)
      : json(
          {
            error:
              "Esta informação ainda não foi baixada. Conecte à internet e prepare o dispositivo.",
          },
          503,
        );
  }
}
function operationLabel(home, id) {
  const row =
    home?.rows?.find((r) => r.id === id) ||
    home?.calendarRows?.find((r) => r.id === id);
  return row?.number
    ? "OS " + row.number + " / OP" + String(row.position || 1).padStart(2, "0")
    : "Operação " + id.slice(0, 8);
}
async function enqueue(req) {
  const owner = await read("owner");
  if (!owner)
    return json(
      { error: "Entre no portal com internet antes de usar o modo offline." },
      401,
    );
  const queue = (await read(owner + ":queue")) || [];
  const url = new URL(req.url);
  // Reserve every participant online before starting a shared timer.
  if (url.pathname === "/api/field") {
    const body = await req.clone().json();
    if (body.teamMembers?.length) {
      if (queue.length) return json({error:"Sincronize os apontamentos pendentes antes de iniciar com a equipe."},409);
      try {
        const response = await fetch(req);
        if (response.ok) {
          const currentHeads = (await read(owner + ":heads")) || {};
          delete currentHeads[body.operationId];
          await write([[owner + ":heads", currentHeads]]);
        }
        return response;
      } catch {
        return json({error:"Conecte-se à internet para iniciar com a equipe."},503);
      }
    }
  }
  const heads =
    queue.length || (await read(owner + ":unrefreshed"))
      ? (await read(owner + ":heads")) || {}
      : {};
  let item,
    entries = [
      [owner + ":heads", heads],
      [owner + ":unrefreshed", true],
    ];
  if (url.pathname === "/api/service-scheduling/photos") {
    const form = await req.formData(),
      file = form.get("file"),
      operationId = String(form.get("operationId"));
    const home = await read(key(owner, "/api/field"));
    if (!file || file.size > 3 * 1024 * 1024)
      return json({ error: "Foto limitada a 3 MB após conversão." }, 400);
    if (
      home?.active?.operation_id !== operationId ||
      home.active.kind !== "work" ||
      home.active.state !== "running"
    )
      return json(
        { error: "Inicie ou retome a atividade antes de anexar fotos." },
        400,
      );
    const id = crypto.randomUUID(),
      local = "local-" + id;
    item = {
      id,
      type: "photo",
      operationLabel: operationLabel(home, operationId),
      at: new Date().toISOString(),
      operationId,
      stageId: form.get("stageId"),
      fieldId: form.get("fieldId"),
      file,
      name: file.name,
    };
    entries.push([owner + ":photo:" + local, { file, name: file.name }]);
    queue.push(item);
    await write([...entries, [owner + ":queue", queue]]);
    await registerSync();
    void sync().catch(() => {});
    await notify();
    return json({ id: local, queued: true }, 202);
  }
  if (url.pathname === "/api/field/time-requests") {
    const body = await req.json();
    if (body.action !== "request")
      return json({ error: "Esta ação exige conexão." }, 400);
    body.offline = { capturedAt: new Date().toISOString(), owner };
    queue.push({
      id: body.requestId,
      type: "time-request",
      operationId: body.operationId,
      at: body.offline.capturedAt,
      body,
    });
    await write([...entries, [owner + ":queue", queue]]);
    await registerSync();
    void sync().catch(() => {});
    await notify();
    return json({ ok: true, queued: true }, 202);
  }
  const body = await req.json(),
    home = await read(key(owner, "/api/field")),
    detail = await read(key(owner, "/api/field?operation=" + body.operationId));
  if (!home || !detail)
    return json(
      {
        error: "Baixe os detalhes da operação antes de trabalhar sem internet.",
      },
      409,
    );
  if (queue.some((q) => q.id === body.requestId))
    return json({ saved: true, queued: true }, 202);
  const previous = [...queue]
    .reverse()
    .find((q) => q.type === "action" && q.operationId === body.operationId);
  if (body.version !== undefined && body.version !== detail.operation.version)
    return json(
      {
        error:
          "O relatório foi atualizado. Reabra antes de salvar; o rascunho atual ainda está na tela.",
      },
      409,
    );
  const previousId = previous?.id || heads[body.operationId];
  body.offline = {
    owner,
    capturedAt: new Date().toISOString(),
    baseVersion: detail.operation.version,
    ...(previousId ? { previousRequestId: previousId } : {}),
  };
  item = {
    id: body.requestId,
    type: "action",
    operationId: body.operationId,
    at: body.offline.capturedAt,
    operationLabel: operationLabel(home, body.operationId),
    body,
  };
  let projection;
  try {
    projection = projectField(home, detail, body);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
  if (
    ["start_work", "start_travel", "pause", "resume", "stop"].includes(
      body.action,
    )
  ) {
    const logs = (await read(key(owner, "/api/field/time-requests"))) || {
      fieldSessions: [],
      fieldEvents: [],
      operations: [],
      events: [],
      requests: [],
      timeAdjustmentsAvailable: false,
    };
    const session = projection.session;
    if (session) {
      logs.fieldSessions = [
        { ...session, display_name: home.displayName },
        ...(logs.fieldSessions || []).filter((s) => s.id !== session.id),
      ];
      logs.fieldEvents = [
        ...(logs.fieldEvents || []),
        {
          id: body.requestId,
          operation_id: body.operationId,
          actor: owner,
          action: body.action,
          created_at: body.offline.capturedAt,
          ...body.location,
          located_at: body.location.at,
          document: { sessionId: session.id, reason: session.pause_reason },
        },
      ];
    }
    if (!logs.operations.some((op) => op.id === body.operationId))
      logs.operations.push(detail.operation);
    entries.push([key(owner, "/api/field/time-requests"), logs]);
  }
  queue.push(item);
  await write([
    ...entries,
    [owner + ":queue", queue],
    [key(owner, "/api/field"), home],
    [key(owner, "/api/field?operation=" + body.operationId), detail],
  ]);
  await registerSync();
  void sync().catch(() => {});
  await notify();
  return json({ saved: true, queued: true }, 202);
}
async function flush() {
  const owner = await read("owner");
  if (!owner) return;
  const attempted=new Set();
  const failedTimers=new Set();
  const timer=item=>item.type==="action"&&["start_work","start_travel","pause","resume","stop"].includes(item.body.action);
  async function nextItem(){
    const queue = (await read(owner+":queue")) || [];
    const mapping = (await read(owner+":mapping")) || {};
    const pendingIds = new Set(queue.map(item => item.id));
    function unresolved(value) {
      if (typeof value === "string") return value.startsWith("local-") && !mapping[value];
      if (value && typeof value === "object") return Object.values(value).some(unresolved);
      return false;
    }
    const dependencies=queueDependencies(queue);
    return queue.find(item => !attempted.has(item.id)
      && !item.discardedDependency
      && (!item.failedPermanent||recoverableFailure(item))
      && dependencies.get(item.id).size===0
      && !pendingIds.has(item.body?.offline?.previousRequestId)
      && !unresolved(item.body)
      && !(failedTimers.has(item.body?.offline?.timerChainId||item.operationId) && timer(item))
      && !(item.type === "action" && ["pause","stop","report_send","report_send_partial","report_return","finish_full"].includes(item.body.action)
        && queue.slice(0, queue.indexOf(item)).some(previous => previous.type === "photo" && previous.operationId === item.operationId)));

  }
  try {
    while (true) {
      const identity = await request("/api/field");
      await write([["connected", identity.ok]]);
      if (!identity.ok)
        throw Object.assign(Error(
          identity.status === 401
            ? "Entre novamente para sincronizar."
            : "Não foi possível acessar o sistema.",
        ),{retryable:identity.status===408||identity.status===429||identity.status>=500});
      const home = await identity.json();
      if (home.email !== owner || (await read("owner")) !== owner)
        throw Error("Entre com a conta que criou os registros pendentes.");
      await write([[owner + ":server-home", home]]);
      await reconcileReceipts(owner).catch(()=>{});
      // An idle heartbeat must not download every operation and hold the sender.
      const idle = await exclusive(async () => {
        if((await read("owner"))!==owner)return true;
        if(((await read(owner+":queue"))||[]).length || await read(owner+":unrefreshed"))return false;
        await write([[key(owner,"/api/field"),home]]);
        return true;
      });
      if(idle){await refreshScheduling(owner,home);return;}
      let item = await nextItem();
      while (item) {
        if ((await read("owner")) !== owner)
          throw Error(
            "A conta foi alterada. Entre novamente com a conta das pendências.",
          );
        attempted.add(item.id);
        syncingId=item.id;
        await notify();
        const mapping = (await read(owner + ":mapping")) || {};
        let result;
        try {
        if (item.type === "photo") {
          const form = new FormData();
          form.set("file", item.file, item.name);
          form.set("operationId", item.operationId);
          form.set("stageId", item.stageId);
          form.set("fieldId", item.fieldId);
          form.set("requestId", item.id);
          form.set("offlineOwner", owner);
          result = await request("/api/service-scheduling/photos", {
            method: "POST",
            body: form,
          });
        } else
          result = await request(
            item.type === "time-request"
              ? "/api/field/time-requests"
              : "/api/field",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(replaceIds(item.body, mapping)),
            },
          );
        }catch(error){
          result=json({error: error.name === "TimeoutError" ? "O envio excedeu o tempo de espera. O registro permanece salvo para nova tentativa." : "Não foi possível enviar este registro. Ele permanece salvo para nova tentativa."},504);
        }
        const parsed = await result.json().catch(()=>null);
        const data=parsed||{error:"O servidor não conseguiu processar este registro. Tente sincronizar novamente."};
        if (!result.ok || !parsed || (item.type==="photo"&&!/^\d+$/.test(String(data.id)))) {
          await exclusive(async () => {
            const queue = (await read(owner + ":queue")) || [];
            const pending = queue.find((q) => q.id === item.id);
            if (pending) {
              pending.error = data.error || "Falha ao sincronizar.";
              pending.retryable = result.status === 408 || result.status === 429 || result.status >= 500 || (result.ok && (!parsed || (item.type==="photo"&&!/^\d+$/.test(String(data.id)))));
              pending.failedPermanent=!pending.retryable&&result.status!==401&&typeof parsed?.error==='string';
            }
            await write([[owner + ":queue", queue]]);
          });
          if(result.status===401 || result.status>=500)await write([["connected",false]]);
          await notify();
          if(result.status===401)return;
          if(timer(item))failedTimers.add(item.body?.offline?.timerChainId||item.operationId);
          item=await nextItem();
          continue;
        }
        // Merge acknowledgements into the CURRENT queue, never the pre-upload snapshot.
        // A technician may have saved more work while a large photo was uploading.
        await exclusive(async () => {
          const queue = (await read(owner + ":queue")) || [],
            heads = (await read(owner + ":heads")) || {};
          const currentMapping = (await read(owner + ":mapping")) || {};
          if (item.type === "photo")
            currentMapping["local-" + item.id] = data.id;
          if (item.type === "action") heads[item.operationId] = item.id;
          const photoEntries = [];
          if (item.type === "photo" && data.id) {
            const localPhoto = await read(owner + ":photo:local-" + item.id);
            if (localPhoto)
              photoEntries.push([owner + ":photo:" + data.id, localPhoto]);
          }
          await write([
            ...photoEntries,
            [owner + ":queue", queue.filter((q) => q.id !== item.id)],
            [owner + ":heads", heads],
            [owner + ":mapping", currentMapping],
            [owner + ":lastSync", new Date().toISOString()],
          ]);
        });
        await notify();
        item = await nextItem();
      }
      // Preserve projections while failed/dependent records remain pending.
      if(((await read(owner+":queue"))||[]).length){await refreshScheduling(owner);return;}
      // Fetch a coherent replacement while local edits remain available.
      const latestResponse = await request("/api/field");
      if (!latestResponse.ok)
        throw Error("Não foi possível atualizar a programação.");
      const latest = await latestResponse.json();
      if (latest.email !== owner || (await read("owner")) !== owner)
        throw Error("Conta alterada.");
      const snapshots = [[key(owner, "/api/field"), latest]];
      let interrupted=false;
      for (const row of latest.calendarRows || latest.rows || []) {
        // Work captured while refreshing gets priority over the remaining downloads.
        if(((await read(owner+":queue"))||[]).length){interrupted=true;break;}
        const url = "/api/field?operation=" + row.id,
          response = await request(url);
        if (!response.ok)
          throw Error("Não foi possível atualizar uma operação.");
        snapshots.push([key(owner, url), await response.json()]);
      }
      if(interrupted)continue;
      const logs = await request("/api/field/time-requests");
      if (logs.ok)
        snapshots.push([
          key(owner, "/api/field/time-requests"),
          await logs.json(),
        ]);
      const committed = await exclusive(async () => {
        if ((await read("owner")) !== owner) return false;
        if (((await read(owner + ":queue")) || []).length) return false;
        await write([
          ...snapshots,
          [owner + ":unrefreshed", false],
          ["connected", true],
        ]);
        return true;
      });
      if (committed) {
        await notify();
        return;
      }
      if ((await read("owner")) !== owner) return;
      // More work arrived during refresh: send it before replacing any local state.
    }
  } catch (e) {
    const networkError = ["TypeError", "TimeoutError", "AbortError"].includes(
      e.name,
    );
    if (networkError) await write([["connected", false]]);
    await exclusive(async () => {
      const queue = (await read(owner + ":queue")) || [];
      const pending=queue.find(item=>item.id===syncingId);
      if (pending) {
        pending.error = networkError
          ? "Sem conexão. O envio será retomado automaticamente."
          : e.message;
        pending.retryable = networkError || e.retryable===true;
        if(pending.retryable)delete pending.failedPermanent;
        await write([[owner + ":queue", queue]]);
        await registerSync();
      }
    });
    await notify();
    throw e;
  }
}
async function scheduleRetry(){
  if(!self.nativeStorage)return;
  if(retryTimer)clearTimeout(retryTimer);
  retryTimer=null;
  const owner=await read("owner");
  const queue=owner?(await read(owner+":queue"))||[]:[];
  if(!queue.length){retryAttempt=0;return;}
  const dependencies=queueDependencies(queue);
  if(!queue.some(item=>!item.discardedDependency&&dependencies.get(item.id).size===0&&(!item.failedPermanent||recoverableFailure(item))))return;
  const delay=Math.min(30000,2000*2**Math.min(retryAttempt++,4));
  retryTimer=setTimeout(()=>{retryTimer=null;void sync().catch(()=>{});},delay);
}
function sync() {
  if (!flushing)
    flushing = flush().finally(async () => {
      flushing = null; syncingId = null;await notify();await scheduleRetry();
    });
  return flushing;
}
async function preparedCache(owner, url, body) {
  await exclusive(async () => {
    if ((await read("owner")) !== owner)
      throw Error("Conta alterada. Reabra o portal.");
    if (
      ((await read(owner + ":queue")) || []).length ||
      (await read(owner + ":unrefreshed"))
    )
      throw Error(
        "Um registro foi salvo durante o download. Sincronize e baixe a programação novamente.",
      );
    await write([[key(owner, url), body]]);
  });
}
async function prepare() {
  const owner = await read("owner");
  if (!owner) throw Error("Entre no portal primeiro.");
  if (((await read(owner + ":queue")) || []).length){
    const response=await request('/api/field');if(!response.ok)throw Error('Sem conexão com o sistema.');
    const home=await response.json();if(home.email!==owner)throw Error('Conta alterada.');
    await refreshScheduling(owner,home,true);return;
  }
  const homeResponse = await request("/api/field");
  if (!homeResponse.ok) throw Error("Sem conexão com o sistema.");
  const home = await homeResponse.json();
  if (home.email !== owner) throw Error("Conta alterada. Reabra o portal.");
  await preparedCache(owner, "/api/field", home);
  for (const row of home.calendarRows || home.rows) {
    const url = "/api/field?operation=" + row.id,
      response = await request(url);
    if (!response.ok)
      throw Error("Não foi possível baixar a operação " + row.id);
    const detail = await response.json();
    await preparedCache(owner, url, detail);

    if (detail.operation.document.equipmentId)
      await cacheGet(
        "/api/service-scheduling/equipment?reading=" +
          encodeURIComponent(detail.operation.document.equipmentId),
      );
    const ids = new Set();
    function collect(v, k) {
      if (
        Array.isArray(v) &&
        v.every((x) => typeof x === "string" && /^\d+$/.test(x))
      )
        v.forEach((x) => ids.add(x));
      else if (v && typeof v === "object")
        for (const [key, value] of Object.entries(v)) collect(value, key);
    }
    collect(detail.operation.document.checklistRun);
    for (const id of ids) {
      try {
        await photo("/api/service-scheduling/photos/" + id);
      } catch {}
    }
  }
  for (const url of ["/api/field/time-requests", "/api/field/map"])
    await cacheGet(url);
  if (!self.nativeStorage) {
    const shell = await request("/tecnico");
    if (!shell.ok || new URL(shell.url).pathname != "/tecnico")
      throw Error("Entre novamente antes de preparar o dispositivo.");
    const html = await shell.clone().text(),
      assets = await caches.open(ASSETS);
    await write([[owner + ":shell", html]]);
    const paths = new Set();
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const path = match[1].replaceAll("&amp;", "&");
      if (path.startsWith("/_next/static/") || path.startsWith("/icons/"))
        paths.add(path);
    }
    // Includes lazy chunks (map, signature inputs) and fonts for a cold offline launch.
    const manifest = await request("/field-offline/assets.json");
    if (manifest.ok) {
      const body = await manifest.json();
      for (const path of body.files || [])
        if (path.startsWith("/_next/static/")) paths.add(path);
    }
    const pending = [...paths];
    for (let i = 0; i < pending.length; i += 4)
      await Promise.all(
        pending.slice(i, i + 4).map(async (path) => {
          if (await assets.match(path)) return;
          const asset = await request(path);
          if (!asset.ok)
            throw Error("Falha ao baixar a interface. Tente novamente.");
          await assets.put(path, asset);
        }),
      );
  }
  if ((await read("owner")) !== owner)
    throw Error("Conta alterada. Reabra o portal.");
  await write([
    [owner + ":prepared", new Date().toISOString()],
    ["connected", true],
  ]);
  await notify();
}
async function photo(url) {
  const owner = await read("owner");
  if (!owner) return new Response("", { status: 401 });
  const id = url.split("/").pop();
  if (id.startsWith("local-")) {
    const p = await read(owner + ":photo:" + id);
    return p
      ? new Response(p.file, { headers: { "Content-Type": p.file.type } })
      : new Response("", { status: 404 });
  }
  try {
    const r = await request(url);
    if (!r.ok) throw Error("Foto indisponível no servidor.");
    const blob = await r.clone().blob();
    await write([[owner + ":photo:" + id, { file: blob }]]);
    return r;
  } catch {
    const p = await read(owner + ":photo:" + id);
    return p
      ? new Response(p.file, { headers: { "Content-Type": p.file.type } })
      : new Response("", { status: 503 });
  }
}
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("sync", (event) => {
  if (event.tag === "rj-field-sync") event.waitUntil(sync());
});
self.addEventListener("message", (event) => {
  const { type } = event.data || {};
  event.waitUntil(
    (async () => {
      try {
        if (type === "FIELD_WEB_INIT" && !self.nativeStorage) {
          const response = await request("/api/field");
          if (!response.ok) {
            await write([["owner", undefined]]);
            throw Error("Entre novamente para recuperar suas pendências.");
          }
          const home = await response.json();
          if (typeof home.email !== "string" || !home.email) throw Error("Conta não identificada.");
          // Switch only the active account pointer. Other users' queues remain intact.
          await write([["owner", home.email]]);
        }
        if (type === "FIELD_PREPARE" && self.nativeStorage) {
          await sync();
          await prepare();
        }
        if(type==='FIELD_RETRY'){await retryPending(event.data.id);}
        if(type==='FIELD_DISCARD'){await discardPending(event.data.id,event.data.includeDependents===true);}
        if (type === "FIELD_SYNC") await sync();
        if (type === "FIELD_EXPORT") {
          const owner = await read("owner"),
            queue = owner ? (await read(owner + ":queue")) || [] : [];
          const exported = [];
          const discarded=owner?(await read(owner+':discardedQueue'))||[]:[];
          for (const item of [...queue,...discarded]) {
            if (item.type !== "photo") {
              exported.push(item);
              continue;
            }
            const bytes = new Uint8Array(await item.file.arrayBuffer());
            let binary = "";
            for (let i = 0; i < bytes.length; i += 16384)
              binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
            exported.push({
              ...item,
              file: {
                name: item.name,
                type: item.file.type,
                base64: btoa(binary),
              },
            });
          }
          event.ports[0]?.postMessage({
            ok: true,
            backup: {
              format: "rj-field-offline-v1",
              owner,
              exportedAt: new Date().toISOString(),
              queue: exported.slice(0,queue.length),
              discarded:exported.slice(queue.length),
              mapping: (await read(owner + ":mapping")) || {},
            },
          });
          return;
        }
        event.ports[0]?.postMessage({ ok: true, ...(await status()) });
      } catch (e) {
        event.ports[0]?.postMessage({
          ok: false,
          error: e.message,
          ...(await status()),
        });
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api/session" && req.method === "POST") {
    event.respondWith(
      (async () => {
        return exclusive(async () => {
          const r = await fetch(req);
          if (r.ok) await write([["owner", undefined]]);
          return r;
        });
      })(),
    );
    return;
  }
  // Browser: online-only. Keep the old queue available for explicit recovery,
  // but never intercept new submissions or serve cached/offline pages.
  if (!self.nativeStorage) return;
  if (req.mode === "navigate" && url.pathname === "/tecnico") {
    event.respondWith(
      (async () => {
        try {
          const r = await request(req);
          if (r.ok && new URL(r.url).pathname === "/tecnico") return r;
          if (r.status < 500) return r;
          throw Error();
        } catch {
          const owner = await read("owner"),
            html = owner ? await read(owner + ":shell") : null;
          return html
            ? new Response(html, {
                headers: { "Content-Type": "text/html; charset=utf-8" },
              })
            : new Response(
                "Conecte à internet para entrar e preparar o dispositivo para uso offline.",
                {
                  status: 503,
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                },
              );
        }
      })(),
    );
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const c = await caches.open(ASSETS),
          saved = await c.match(req);
        if (saved) return saved;
        const r = await fetch(req);
        if (r.ok) await c.put(req, r.clone());
        return r;
      })(),
    );
    return;
  }
  // Only requests from the technician portal use its durable queue.
  event.respondWith(
    (async () => {
      const client = await self.clients.get(event.clientId);
      if (!client || new URL(client.url).pathname != "/tecnico")
        return fetch(req);
      if (
        req.method === "POST" &&
        (url.pathname === "/api/field" ||
          url.pathname === "/api/service-scheduling/photos" ||
          url.pathname === "/api/field/time-requests")
      ) {
        let result;
        try {
          result = await exclusive(() => enqueue(req));
        } catch (error) {
          return json(
            {
              error:
                error.name === "QuotaExceededError"
                  ? "O armazenamento do aparelho está cheio. Libere espaço e salve novamente."
                  : "Não foi possível salvar no dispositivo. Mantenha a tela aberta e tente novamente.",
            },
            507,
          );
        }
        event.waitUntil(sync().catch(() => {}));
        return result;
      }
      if (
        req.method === "GET" &&
        url.pathname.startsWith("/api/service-scheduling/photos/")
      )
        return photo(url.pathname);
      if (
        req.method === "GET" &&
        (url.pathname === "/api/field" ||
          url.pathname === "/api/field/map" ||
          url.pathname === "/api/field/time-requests" ||
          url.pathname === "/api/service-scheduling/equipment")
      )
        return exclusive(() => cacheGet(url.pathname + url.search));
      return fetch(req);
    })(),
  );
});
