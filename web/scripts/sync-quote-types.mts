import {refreshQuoteTypes} from "../lib/quote-type-catalog";
import {database} from "../lib/db";
try{console.log("Tipos de orçamento importados:",await refreshQuoteTypes());}finally{await database().end();}
