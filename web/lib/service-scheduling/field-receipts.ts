import "server-only";
import {database} from "../db";
import {FieldError} from "./field-store";
export async function fieldReceipts(actor:string,ids:string[]) {
  if(!ids.length||ids.length>200||ids.some(id=>! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw new FieldError('Consulta de recibos inválida.');
  const rows=(await database().query(`SELECT request_id::text id,operation_id::text "operationId",'action' type,NULL::text "photoId" FROM web_field_events WHERE actor=$1 AND request_id=ANY($2::uuid[])
    UNION ALL SELECT client_request_id::text id,operation_id::text "operationId",'photo' type,id::text "photoId" FROM web_service_checklist_photos WHERE created_by=$1 AND client_request_id=ANY($2::uuid[])`,[actor,ids])).rows;
  return {email:actor,receipts:rows};
}
