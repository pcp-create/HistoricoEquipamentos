import "server-only";
import * as Preview from "./history.preview";
export {buildWhere} from "./history.stable";
export async function history(...args:Parameters<typeof Preview.history>) {
 return (Preview.history)(...args);
}
export async function overview(...args:Parameters<typeof Preview.overview>) {
 return (Preview.overview)(...args);
}
export async function orderDetail(...args:Parameters<typeof Preview.orderDetail>) {
 return (Preview.orderDetail)(...args);
}
