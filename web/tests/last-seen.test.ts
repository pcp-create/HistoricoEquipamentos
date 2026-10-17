import {test} from "node:test";
import assert from "node:assert/strict";
import {lastSeen} from "../lib/last-seen";
test("last seen changes unit at hour, day, month and year boundaries",()=>{
 const now=Date.parse("2026-10-17T15:00:00Z");
 for(const [minutes,label]of [[0,"Agora"],[59,"há 59 minutos"],[60,"há 1 hora"],[120,"há 2 horas"],[1440,"há 1 dia"],[2880,"há 2 dias"],[43200,"há 1 mês"],[525600,"há 1 ano"]] as const)assert.equal(lastSeen(new Date(now-minutes*60000).toISOString(),now),label);
 assert.equal(lastSeen("invalid",now),"Não registrado");
});
