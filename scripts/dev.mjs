// Starts the whole system for development: the backend (ERP, port 3100) and the website
// (studio, port 3000, proxying /api to the backend). One terminal, prefixed output, Ctrl+C stops both.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apps = [
  { name: "api", dir: "ERP", color: "\x1b[36m" },
  { name: "web", dir: "studio", color: "\x1b[35m" },
];

// `npm run demo`: the same two apps, but the backend runs on the separate DEMO database (built on first use).
const demo = process.argv.includes("--demo");
if (demo) {
  const built = spawnSync("npm", ["--prefix", "ERP", "run", "demo:build"], { cwd: root, stdio: "inherit", shell: true });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const demoPort = process.env.ERP_PORT || "3101";
const demoEnv = { ERP_PORT: demoPort, PGLITE_DEV: "true", PGLITE_DATA_DIR: path.join(root, "ERP", "database", ".pgdata-demo") };

const children = apps.map(({ name, dir, color }) => {
  const child = spawn("npm", ["run", "dev"], { cwd: path.join(root, dir), shell: true, env: demo ? (name === "api" ? { ...process.env, ...demoEnv } : { ...process.env, ERP_URL: `http://localhost:${demoPort}` }) : process.env });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) out.write(tag + line + "\n");
  });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${tag}exited (${code ?? "signal"})`);
    stop();
  });
  return child;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try {
      // `shell: true` wraps npm in a shell; kill the whole tree on Windows.
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"]);
      else c.kill("SIGTERM");
    } catch { /* already gone */ }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
