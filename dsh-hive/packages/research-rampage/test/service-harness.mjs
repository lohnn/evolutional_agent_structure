// Phase-2a-style gate: boot the ResearchRampage plugin against a REAL cordis
// Context and the REAL CommandRuntime (the same createRequire-from-profile
// trick painpoints' service-harness uses to resolve the loose peer deps), then
// discover the command through the registry and drive its handler directly
// (execute() would entangle the session log; the handler direct call is the
// documented path a composer's executor reaches next anyway).
import { Context } from "@deepseek-ai/cordis"
import assert from "node:assert/strict"

const results = []
const check = (id, ok, detail) => {
  results.push({ ok, id })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const { createRequire } = await import("node:module")
const profileRequire = createRequire("/root/.dsh/profiles/web/package.json")
const CommandsMod = profileRequire("@deepseek-ai/dsh-commands")
const CommandRuntime = CommandsMod.default ?? CommandsMod.CommandRuntime

const ctx = new Context()
new CommandRuntime(ctx)
await new Promise((r) => setTimeout(r, 50))

// Lazy-registration gate: the effect must own mounting — nothing registered
// before ctx.plugin, and the effect's returned disposer must unregister.
const stubAgent = { id: "harness-agent", followup() {} }
check(
  "lazy.before-mount",
  !ctx.commands.find(stubAgent, "research-rampage"),
  "no command before the plugin mounts",
)
const realRegister = ctx.commands.register.bind(ctx.commands)
const effectDisposers = []
ctx.commands.register = (def) => {
  const d = realRegister(def)
  effectDisposers.push(d)
  return d
}

const ResearchRampageMod = await import("dsh-research-rampage")
const ResearchRampage = ResearchRampageMod.default ?? ResearchRampageMod.ResearchRampage
const loadRampageBrief = ResearchRampageMod.loadRampageBrief
ctx.plugin(ResearchRampage)
await new Promise((r) => setTimeout(r, 50))

check("boot.service", !!ctx["research-rampage"], "ctx.research-rampage registered")
check(
  "lazy.after-mount",
  !!ctx.commands.find(stubAgent, "research-rampage") && effectDisposers.length === 1,
  "the effect mounted exactly one command",
)

// Discovery: the composer's /-menu reads list(agent); the global layer serves
// every agent, so the stub identity from the lazy gate must resolve the command.
let descriptors = []
try {
  descriptors = [...ctx.commands.list(stubAgent)]
} catch (err) {
  check("discover.list", false, `commands.list threw: ${String(err)}`)
}
const desc = descriptors.find((d) => d.name === "research-rampage")
check("discover.list", !!desc, descriptors.map((d) => d.name).join(", ") || "(none)")
check(
  "discover.hint",
  !!desc?.input?.hint && /interview|optional/i.test(desc.input.hint),
  String(desc?.input?.hint),
)
check(
  "discover.description",
  !!desc?.description && /subagent/.test(desc.description) && /TL;DR/.test(desc.description),
  "description carries the surface contract",
)

const def = ctx.commands.find(stubAgent, "research-rampage")
check("discover.find", !!def, "find resolves the global definition")

// Refusal without a receiving agent (composer-less dispatch has no target).
const refused = def.handler({ agent: undefined, rawInput: "x" })
check(
  "handler.no-agent",
  refused.kind === "error" && /bare CLI/.test(refused.text),
  refused.kind === "error" ? refused.text : JSON.stringify(refused),
)

// The happy path: the brief + opening line ride a user-role followup.
let followups = []
const receiving = { id: "harness-agent", followup(msg) { followups.push(msg) } }
const run = def.handler({ agent: receiving, rawInput: "zig-related deep dives" })
const text = followups[0]?.content?.[0]?.text ?? ""
check("handler.run", run.kind === "success", String(run.text))
check("handler.user-role", followups[0]?.role === "user", String(followups[0]?.role))
check("handler.brief-fresh", text.includes(loadRampageBrief()), "followup carries the CURRENT on-disk kit (per-launch read)")
check("handler.brief", text.includes("Phase 0 — INTERROGATE") && text.includes("Phase 4 — VALIDATION LOOP") && text.includes("Phase 5 — TL;DR"), "all-phase brief in the followup")
check("handler.goal", text.includes("<initial-research-goal>") && text.includes("zig-related deep dives"), "opening line fenced and echoed")
check("handler.begin", text.includes("Begin with Phase 0 now"), "coordinator kickoff line present")

// Empty opening line: success, from-zero branch, no goal fence to the model.
let zeroInput = []
const zeroReceiver = { id: "harness-agent", followup(msg) { zeroInput.push(msg) } }
const zrun = def.handler({ agent: zeroReceiver, rawInput: "   " })
const ztext = zeroInput[0]?.content?.[0]?.text ?? ""
check(
  "handler.empty-input",
  zrun.kind === "success" && ztext.includes("no opening line") && !ztext.includes("<initial-research-goal>"),
  "empty raw input ramps from zero",
)

// Dispose lifecycle: the effect's disposer unregisters through the REAL
// registry; the same name can then be registered again (the loader's
// reload path is exactly that — no poisoned duplicate-name lockout).
effectDisposers[0]()
check(
  "dispose.unregisters",
  !ctx.commands.find(stubAgent, "research-rampage"),
  "disposer removes the command from the real registry",
)
let reregistered = true
const probeName = "research-rampage"
try {
  const probe = realRegister({
    ...def,
    name: probeName,
    handler: () => ({ kind: "success", text: "probe" }),
  })
  check(
    "dispose.reregister-same-name",
    !!ctx.commands.find(stubAgent, probeName),
    "same name registers again after dispose (reload-safe)",
  )
  probe()
} catch (err) {
  reregistered = false
}
check(
  "dispose.reregister-same-name",
  reregistered && !ctx.commands.find(stubAgent, probeName),
  "probe cleaned up; registry state balanced",
)

const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
