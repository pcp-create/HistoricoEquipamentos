import 'server-only';
import {database} from '../db';
import {warehouseDeliveryTotals} from '../warehouse/store';
import {materialQuantity,materialWithdrawals} from './material-balance';
/** Portals describe the same movement; declarations and physical receipts must not be added twice. */
export function materialMovementTotals(rows:any[],delivery=0,receipt=0){
 const withdrawals=rows.flatMap(materialWithdrawals);
 const technicalWithdrawn=withdrawals.reduce((sum,row)=>sum+Number(row.gross??Number(row.quantity)+Number(row.returned||0)),0);
 const technicalReturned=withdrawals.reduce((sum,row)=>sum+Number(row.returned||0),0);
 const withdrawn=materialQuantity(Math.max(technicalWithdrawn,delivery));
 const returned=materialQuantity(Math.max(technicalReturned,receipt));
 return {withdrawn,returned,used:materialQuantity(withdrawn-returned)};
}
export async function withMaterialMovements(items:any[],db:any=database()){
 if(!items.length)return items;
 const keys=items.map(i=>({company:Number(i.item_company),ord:String(i.item_order),item:String(i.id_m8)}));
 const [delivery,receipt,usage]=await Promise.all([
  warehouseDeliveryTotals(db,items),warehouseDeliveryTotals(db,items,'receipt'),
  db.query(`SELECT u.* FROM web_service_item_usage u WHERE EXISTS(SELECT 1 FROM jsonb_to_recordset($1::jsonb) k(company int,ord bigint,item bigint) WHERE k.company=u.item_company AND k.ord=u.item_order AND k.item=u.item_id)`,[JSON.stringify(keys)]),
 ]);
 return items.map(item=>{
  const key=`${item.item_company}:${item.item_order}:${item.id_m8}`;
  const rows=usage.rows.filter((u:any)=>String(u.item_company)===String(item.item_company)&&String(u.item_order)===String(item.item_order)&&String(u.item_id)===String(item.id_m8));
  return {...item,movement:materialMovementTotals(rows,Number(delivery.get(key)?.quantity||0),Number(receipt.get(key)?.quantity||0))};
 });
}
