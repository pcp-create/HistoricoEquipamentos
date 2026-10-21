import "server-only";
import * as Preview from "./store.preview";
export {EquipmentConflict} from "./store.preview";
export async function equipmentList(...args:Parameters<typeof Preview.equipmentList>) {
 return (Preview.equipmentList)(...args);
}
export async function equipmentDetail(...args:Parameters<typeof Preview.equipmentDetail>) {
 return (Preview.equipmentDetail)(...args);
}
export async function saveEquipment(...args:Parameters<typeof Preview.saveEquipment>) {
 return (Preview.saveEquipment)(...args);
}
