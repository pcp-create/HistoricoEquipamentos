import {test} from 'node:test';import assert from 'node:assert/strict';
import {calendarWeek,movementAxis} from '../lib/workshop/movement-axis';
const rows=(dates:string[])=>dates.map(date=>({date}));
test('ISO week numbers handle week 53 and calendar year boundaries',()=>{
 for(const [day,year,number,month] of [['2021-01-01',2020,53,'2020-12'],['2021-01-04',2021,1,'2021-01'],['2018-12-31',2019,1,'2019-01'],['2026-01-01',2026,1,'2026-01'],['2026-10-30',2026,44,'2026-10']] as const)assert.deepEqual(calendarWeek(day),{year,number,month});
});
test('daily labels contain only the day, with contiguous month and year groups',()=>{
 const axis=movementAxis(rows(['2025-12-30','2025-12-31','2026-01-01','2026-01-02']),'day');
 assert.deepEqual(axis.labels,['30','31','01','02']);
 assert.deepEqual(axis.months.map(g=>[g.key,g.label,g.first,g.last]),[['2025-12','Dezembro',0,1],['2026-01','Janeiro',2,3]]);
 assert.deepEqual(axis.years.map(g=>[g.key,g.first,g.last]),[['2025',0,1],['2026',2,3]]);
});
test('weekly labels and groups stay coherent when a week crosses a month or year',()=>{
 const axis=movementAxis(rows(['2020-12-28','2021-01-04','2021-01-11']),'week');
 assert.deepEqual(axis.labels,['Sem. 53','Sem. 01','Sem. 02']);
 assert.deepEqual(axis.months.map(g=>[g.key,g.first,g.last]),[['2020-12',0,0],['2021-01',1,2]]);
 assert.deepEqual(axis.years.map(g=>[g.key,g.first,g.last]),[['2020',0,0],['2021',1,2]]);
 const boundary=movementAxis(rows(['2025-12-29','2026-01-05']),'week');assert.deepEqual(boundary.labels,['Sem. 01','Sem. 02']);assert.equal(boundary.years.length,1);assert.equal(boundary.years[0].label,'2026');assert.equal(boundary.months[0].label,'Janeiro');
});
test('month and year views avoid redundant date levels and handle empty ranges',()=>{
 const month=movementAxis(rows(['2025-01-01','2025-12-01','2026-01-01']),'month');assert.deepEqual(month.labels,['Jan','Dez','Jan']);assert.equal(month.months.length,0);assert.deepEqual(month.years.map(g=>[g.key,g.first,g.last]),[['2025',0,1],['2026',2,2]]);
 const year=movementAxis(rows(['2025-01-01','2026-01-01']),'year');assert.deepEqual(year.labels,['2025','2026']);assert.equal(year.months.length+year.years.length,0);
 assert.deepEqual(movementAxis([],'day'),{labels:[],months:[],years:[]});
});
