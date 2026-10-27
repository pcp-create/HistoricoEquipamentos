import "server-only";
import { database } from "../db";
import { visitIdentity } from "./store";

export async function getVisitPhoto(id: string, email: string, db: any = database()) {
  // Visit management is shared by all active profiles, including visits to leads.
  await visitIdentity(db, email.toLowerCase());
  return (await db.query(
    "SELECT p.content FROM web_visit_photos p JOIN web_sales_visits v ON v.id=p.visit_id WHERE p.id=$1",
    [id],
  )).rows[0] || null;
}
