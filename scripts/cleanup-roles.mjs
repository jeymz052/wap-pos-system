// Cleanup duplicate roles — keeps only the 7 canonical snake_case roles
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, "../.env.local"), "utf8")
    .split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H   = { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" };

const CANONICAL = new Set(["super_admin","admin","manager","cashier","inventory_staff","accountant","branch_staff"]);

const roles = await (await fetch(`${URL}/rest/v1/roles?select=id,name`, { headers: H })).json();
console.log("All roles found:", roles.map(r => r.name));

const toRemove = roles.filter(r => !CANONICAL.has(r.name));
if (!toRemove.length) {
  console.log("✅ No duplicates to remove.");
} else {
  console.log("Removing duplicates:", toRemove.map(r => r.name));
  for (const r of toRemove) {
    await fetch(`${URL}/rest/v1/role_permissions?role_id=eq.${r.id}`, { method: "DELETE", headers: H });
    const d = await fetch(`${URL}/rest/v1/roles?id=eq.${r.id}`, { method: "DELETE", headers: H });
    console.log(`  ✓ Deleted "${r.name}": ${d.status}`);
  }
}

const final = await (await fetch(`${URL}/rest/v1/roles?select=name&order=name`, { headers: H })).json();
console.log("\n✅ Final roles in database:");
final.forEach(r => console.log(`  • ${r.name}`));
