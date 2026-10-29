import {readFileSync} from "node:fs";
import {database} from "../lib/db";
const db=database(),c=await db.connect();
try{for(const file of ["083_warehouse_deliveries","084_warehouse_returns","085_warehouse_notifications","086_warehouse_flow","087_warehouse_withdrawal_approvals"])await c.query(readFileSync(new URL("../sql/"+file+".sql",import.meta.url),"utf8").replace("BEGIN;","BEGIN READ WRITE;"));console.log("Estrutura de entregas, recebimentos, inclusões e notificações do almoxarifado criada/verificada.");}
catch(error){await c.query("ROLLBACK");throw error;}
finally{c.release();await db.end();}
