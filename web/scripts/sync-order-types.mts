import {refreshOrderTypes} from "../lib/order-type-catalog";
import {database} from "../lib/db";
try{console.log("Tipos de OS importados:",await refreshOrderTypes());}finally{await database().end();}
