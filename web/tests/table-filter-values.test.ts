import {test} from "node:test";
import assert from "node:assert/strict";
import {tableFilterValues} from "../lib/table-filter-values";
const rows = [
  {seller:"Ana",region:"Sul",city:"Lages"},
  {seller:"Ana",region:"Norte",city:"Manaus"},
  {seller:"Bruno",region:"Sudeste",city:"São Paulo"},
  {seller:"Bruno",region:"",city:""},
];
const value=(row:typeof rows[number],key:string)=>row[key as keyof typeof row];
test("column values respect other filters, allow changing their own selection and preserve valid blanks",()=>{
  assert.deepEqual(tableFilterValues(rows,"region",{seller:["Ana"]},value),["Norte","Sul"]);
  assert.deepEqual(tableFilterValues(rows,"region",{seller:["Ana"],region:["Sul"]},value),["Norte","Sul"]);
  assert.deepEqual(tableFilterValues(rows,"city",{seller:["Ana"],region:["Sul"]},value),["Lages"]);
  assert.deepEqual(tableFilterValues(rows,"region",{seller:["Bruno"]},value),["","Sudeste"]);
  assert.deepEqual(tableFilterValues(rows,"city",{seller:[]},value),[]);
  assert.equal(tableFilterValues(rows,"region",{},value).length,4);
});
