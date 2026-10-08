// W-090 regression, caught LIVE in the token-economy smoke (2026-10-07):
// a strict cordis host REFUSES undeclared service reads — the first live
// dispatch with dream_ids threw "cannot get property dreamArchive without
// inject" although the dream plugin was mounted and healthy, and the loose
// test harness had sailed through the same code for weeks (W-047's negative
// lesson: END-STATE verification needs the enforcing runtime, which the
// fixture is not — so the enforcement is SIMULATED EXACTLY where the live
// host applies it: property reads of undeclared service names throw).
//
// Pins three things:
// 1. optionalService survives a strict store via ctx.get (the sanctioned
//    no-inject-requirement accessor) and never throws in any shape;
// 2. the dispatch seam uses it — no bare ctx.dreamArchive reflection may
//    return (source-scan guard against reintroduction);
// 3. the compaction seam rides the same helper.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"
import url from "node:url"
import { optionalService } from "@hive/dsh-evolution"

const PKG = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..")

// The live host's law, as a proxy: undeclared service-like property reads
// throw with the exact live message; everything else passes through.
function strictStore(t, declared) {
  return new Proxy(t, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && /^[a-z][A-Za-z]+$/.test(prop) && !declared.has(prop) && !(prop in target)) {
        throw new Error(`cannot get property ${prop} without inject`)
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

test("w090: optionalService reads a mounted service THROUGH a strict store via ctx.get", () => {
  const archive = { pathForId: () => "/x" }
  const strict = strictStore({ get: (n) => (n === "dreamArchive" ? archive : undefined) }, new Set(["get"]))
  assert.equal(optionalService(strict, "dreamArchive"), archive)
  assert.equal(optionalService(strict, "neverMounted"), undefined)
})

test("w090: never throws in any ctx shape", () => {
  // no get at all (a ctx without cordis): undefined, never throws — and the
  // PROPERTY is deliberately NOT consulted (stale-property hazard: after a
  // provide/dispose cycle a raw read still sees the unmounted value)
  assert.equal(optionalService({ dreamArchive: { v: 1 } }, "dreamArchive"), undefined)
  // get exists but itself throws (worst-case runtime)
  assert.equal(optionalService({ get: () => { throw new Error("cannot get property dreamArchive without inject") } }, "dreamArchive"), undefined)
  // property read throws AND get throws
  const hostile = strictStore({ get: () => { throw new Error("boom") } }, new Set())
  assert.equal(optionalService(hostile, "dreamArchive"), undefined)
})

test("w090: the dispatch and compaction seams use the helper — no bare reflection remains", () => {
  const src = fs.readFileSync(path.join(PKG, "src", "index.ts"), "utf8")
  assert.ok(!src.includes('this.ctx as { dreamArchive?'), "bare ctx.dreamArchive reflection must stay dead")
  const uses = src.match(/optionalService[^\n]*\(this\.ctx, "dreamArchive"\)/g) ?? []
  assert.ok(uses.length >= 2, `both seams must go through optionalService (found ${uses.length})`)
  const helper = fs.readFileSync(path.join(PKG, "src", "lib", "service-optional.ts"), "utf8")
  assert.ok(helper.includes("ctx.get"), "helper priority is ctx.get, not the property")
})
