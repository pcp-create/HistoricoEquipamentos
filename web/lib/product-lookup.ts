import "server-only";
import {adminPreview} from "@/lib/admin-preview";
import * as Preview from "./product-lookup.preview";
import * as Stable from "./product-lookup.stable";
export async function productLookup(...args:Parameters<typeof Preview.productLookup>) {
 return (await adminPreview()?Preview.productLookup:Stable.productLookup)(...args);
}
export async function similarProducts(...args:Parameters<typeof Preview.similarProducts>) {
 return (await adminPreview()?Preview.similarProducts:Stable.similarProducts)(...args);
}
export async function searchProducts(...args:Parameters<typeof Preview.searchProducts>) {
 return (await adminPreview()?Preview.searchProducts:Stable.searchProducts)(...args);
}
