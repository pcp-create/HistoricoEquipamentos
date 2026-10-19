import {test} from "node:test";
import assert from "node:assert/strict";
import {completedOperationHours} from "../lib/service-scheduling/time-logs";
test("finished team sessions count before report submission, including travel and pauses, without mirrored duplicates",()=>{
 const sessions=[
  {id:"travel",operation_id:"op",actor:"tech",kind:"travel",state:"finished",active_seconds:900,pause_seconds:0,legacy_event_id:1},
  {id:"work",operation_id:"op",actor:"helper",kind:"work",state:"finished",active_seconds:3600,pause_seconds:600,legacy_event_id:2,correction:{active_seconds:1800}},
  {id:"running",operation_id:"op",actor:"tech",kind:"work",state:"running",active_seconds:100,segment_at:"2026-01-01T00:00:00Z"},
  {id:"other",operation_id:"other",kind:"work",state:"finished",active_seconds:3600,pause_seconds:0}
 ];
 const events=[
  {id:1,operation_id:"op",action:"travel_log",hours:0.25},
  {id:2,operation_id:"op",action:"work_log",hours:1},
  {id:3,operation_id:"op",action:"work_log",hours:0.5}
 ];
 assert.equal(completedOperationHours("op",sessions,[],events),(900+1800+600+1800)/3600);
 assert.equal(completedOperationHours("op",[],[],[{operation_id:"op",action:"work_log",hours:2}]),2);
 assert.equal(completedOperationHours("empty",sessions,[],events),0);
});
