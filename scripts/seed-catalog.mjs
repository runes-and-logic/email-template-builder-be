// Generate a reviewable migration from the existing, preserved template library.
import { writeFile } from "node:fs/promises";
import { templates } from "@postly/email-core/data";
import { fromTemplate } from "@postly/email-core/workspace";
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const rows = templates.map(template => {
  const document = { ...fromTemplate(template), id: template.id };
  return `(${quote(template.id)},${quote(template.name)},${quote(template.category)},${quote(JSON.stringify(document))}::jsonb,true)`;
});
await writeFile(new URL("../supabase/migrations/202611040006_catalog.sql", import.meta.url), `begin;\ninsert into public.template_catalog(id,name,category,content,published) values\n${rows.join(",\n")}\non conflict(id) do nothing;\ncommit;\n`);
