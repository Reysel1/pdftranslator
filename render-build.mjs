import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const root = dirname(fileURLToPath(import.meta.url))
process.chdir(root)

const run = (cmd, extraEnv) => {
  execSync(cmd, {
    stdio: "inherit",
    cwd: root,
    shell: true,
    env: { ...process.env, ...extraEnv, CI: "true" },
  })
}

run("npx --yes pnpm@9.15.0 install --frozen-lockfile", { NODE_ENV: "development" })
run("npm run build", { NODE_ENV: "production" })
