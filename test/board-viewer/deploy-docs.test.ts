import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"

const DEPLOY = path.join(import.meta.dir, "..", "deploy")

describe("deploy docs cannot drift", () => {
  test("README embeds entrypoint-fragment.sh byte-for-byte", () => {
    const fragment = fs.readFileSync(path.join(DEPLOY, "entrypoint-fragment.sh"), "utf8").trim()
    const readme = fs.readFileSync(path.join(DEPLOY, "README.md"), "utf8")
    expect(readme).toContain(fragment)
  })

  test("the guide's failure log line matches what the server actually prints", () => {
    const readme = fs.readFileSync(path.join(DEPLOY, "README.md"), "utf8")
    const server = fs.readFileSync(path.join(import.meta.dir, "..", "src", "server.ts"), "utf8")
    const notConfigured = "session backend: NOT configured (Start disabled; set --opencode-url / OPENCODE_SERVER_PASSWORD)"
    expect(readme).toContain(notConfigured)
    expect(server).toContain(notConfigured)
  })
})
