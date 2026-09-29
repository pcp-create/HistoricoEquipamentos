import 'server-only';
import {initialSessionAccess} from './initial-access';
// Never infer preview access from a browser-supplied flag or email allowlist.
export async function adminPreview(){
 try{return (await initialSessionAccess()).admin;}catch{return false;}
}
