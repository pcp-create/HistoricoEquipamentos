/** Physical receipts and technician declarations are independent records. */
export function warehouseReceiptBalance(item:any){
 const outgoing=Math.max(Number(item.delivery?.quantity||0),Number(item.usage?.gross||0));
 return Math.max(0,Math.round((outgoing-Number(item.received?.quantity||0))*1000)/1000);
}
