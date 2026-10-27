import {CycleRepository} from '../database/cycle.repository.js';
import type {Database} from '../database/postgres.js';
import type {HeaderSnapshot} from '../m8/collections.js';

// Compatibility name retained for existing scripts; now refreshes changed headers too.
export async function insertNewOrders(db:Database,company:number,headers:HeaderSnapshot[],timeZone:string){
 return new CycleRepository(db,company,timeZone).ingestHeaders(headers,new Date());
}
