// Runs the ERP on the DEMO database (building it first if it does not exist yet).
// The real development database is never touched: the demo lives in database/.pgdata-demo.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const erp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const built = spawnSync("npm", ["run", "demo:build"], { cwd: erp, stdio: "inherit", shell: true });
if (built.status !== 0) process.exit(built.status ?? 1);

const port = process.env.ERP_PORT || "3101";
console.log(`\nStarting the ERP on the demo database → http://localhost:${port}\n`);
const server = spawn("npm", ["run", "dev"], {
  cwd: erp, stdio: "inherit", shell: true,
  env: { ...process.env, ERP_PORT: port, PGLITE_DEV: "true", PGLITE_DATA_DIR: path.join(erp, "database", ".pgdata-demo") },
});
server.on("exit", (code) => process.exit(code ?? 0));
