import "server-only";
import * as Preview from "./product-lookup.preview";
export async function productLookup(...args:Parameters<typeof Preview.productLookup>) {
 return (Preview.productLookup)(...args);
}
export async function similarProducts(...args:Parameters<typeof Preview.similarProducts>) {
 return (Preview.similarProducts)(...args);
}
export async function searchProducts(...args:Parameters<typeof Preview.searchProducts>) {
 return (Preview.searchProducts)(...args);
}
