import "server-only";
import {adminPreview} from "@/lib/admin-preview";
import * as Preview from "./history.preview";
import * as Stable from "./history.stable";
export {buildWhere} from "./history.stable";
export async function history(...args:Parameters<typeof Preview.history>) {
 return (await adminPreview()?Preview.history:Stable.history)(...args);
}
export async function overview(...args:Parameters<typeof Preview.overview>) {
 return (await adminPreview()?Preview.overview:Stable.overview)(...args);
}
export async function orderDetail(...args:Parameters<typeof Preview.orderDetail>) {
 return (await adminPreview()?Preview.orderDetail:Stable.orderDetail)(...args);
}
