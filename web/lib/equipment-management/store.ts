import "server-only";
import {adminPreview} from "@/lib/admin-preview";
import * as Preview from "./store.preview";
import * as Stable from "./store.stable";
export {EquipmentConflict} from "./store.preview";
export async function equipmentList(...args:Parameters<typeof Preview.equipmentList>) {
 return (await adminPreview()?Preview.equipmentList:Stable.equipmentList)(...args);
}
export async function equipmentDetail(...args:Parameters<typeof Preview.equipmentDetail>) {
 return (await adminPreview()?Preview.equipmentDetail:Stable.equipmentDetail)(...args);
}
export async function saveEquipment(...args:Parameters<typeof Preview.saveEquipment>) {
 return (await adminPreview()?Preview.saveEquipment:Stable.saveEquipment)(...args);
}
