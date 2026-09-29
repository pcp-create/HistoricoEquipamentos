import { test } from "node:test";
import assert from "node:assert/strict";
import { operationCalendarDates, operationCalendarAllocation } from "../lib/service-scheduling/calendar";
const calendar = {
  week: [1,2,3,4,5].flatMap(day => [{day,start:"08:00",end:"12:00"},{day,start:"13:00",end:"17:00"}]),
};
test("operations occupy working dates according to their duration", () => {
  const op = {date:"2026-09-29",time:"15:00",duration:4};
  assert.deepEqual(operationCalendarDates(op,calendar),["2026-09-29","2026-09-30"]);
  assert.deepEqual(operationCalendarDates({...op,duration:2},calendar),["2026-09-29"]);
  assert.deepEqual(operationCalendarDates({...op,date:"2026-10-02"},calendar),["2026-10-02","2026-10-05"]);
  assert.deepEqual(operationCalendarDates({...op,time:"11:00",duration:2},calendar),["2026-09-29"]);
  assert.deepEqual(operationCalendarDates({...op,duration:12},calendar),["2026-09-29","2026-09-30","2026-10-01"]);
  assert.deepEqual(operationCalendarDates(op,{...calendar,exceptions:[{startDate:"2026-09-30",endDate:"2026-09-30",hours:[]}]}),["2026-09-29","2026-10-01"]);
  assert.deepEqual(operationCalendarDates({...op,time:""},calendar),["2026-09-29"]);
  const continuous = {week:[0,1,2,3,4,5,6].map(day=>({day,start:"00:00",end:"24:00"}))};
  assert.deepEqual(operationCalendarDates({...op,time:"00:00",duration:24},continuous),["2026-09-29"]);
});


test("daily hours sum to duration and estimated finish follows working slots", async () => {
  const { calendarEnd } = await import("../lib/service-scheduling/model");
  const operation = {date:"2026-09-29",time:"08:00",duration:15};
  const allocation = operationCalendarAllocation(operation,calendar);
  assert.deepEqual(allocation.map(d=>[d.date,d.minutes]),[["2026-09-29",480],["2026-09-30",420]]);
  assert.equal(allocation[0].start,"2026-09-29T11:00:00.000Z");
  assert.equal(allocation[1].start,"2026-09-30T11:00:00.000Z");
  assert.equal(allocation.at(-1)?.end,"2026-09-30T19:00:00.000Z");
  assert.equal(allocation.at(-1)?.end,calendarEnd(operation,calendar));
  const late = {...operation,date:"2026-10-02",time:"16:00",duration:3};
  const split = operationCalendarAllocation(late,calendar);
  assert.deepEqual(split.map(d=>d.minutes),[60,120]);
  assert.equal(split.at(-1)?.end,calendarEnd(late,calendar));
});
