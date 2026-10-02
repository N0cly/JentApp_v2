import { pgTable, text } from "drizzle-orm/pg-core";

// M0 : une seule table, pour valider le pipeline de migrations.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
});
