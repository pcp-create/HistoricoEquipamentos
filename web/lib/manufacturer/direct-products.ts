// Explicit internal IDs are namespaced, never indexed as genuine OEM references.
// Derive these links from the catalog so product synchronization cannot erase them.
export const catalogProductCodesSql = `(SELECT code,company_id,product_id,field FROM manufacturer_product_codes
UNION ALL
SELECT 'M8:' || product_id::text AS code,company_id,product_id,'codigoM8'::text AS field
FROM m8_product_catalog)`;
