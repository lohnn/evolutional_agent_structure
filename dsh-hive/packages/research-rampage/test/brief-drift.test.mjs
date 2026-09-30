// Brief drift guard — assets/brief.md IS the command's real implementation
// (the handler only injects it), so deleting a phase or a load-bearing
// mechanism must fail here before anything else notices. Pure text tests; the
// registration/handler contract lives in test/service-harness.mjs against a
// real cordis Context + CommandRuntime.
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { loadRampageBrief } from "../dist/index.js"

const RAMPAGE_BRIEF = loadRampageBrief()

describe("brief drift guard (assets/brief.md is the command's real implementation)", () => {
  it("carries all six phases", () => {
    for (const phase of [
      "Phase 0 — INTERROGATE",
      "Phase 1 — BLUEPRINT",
      "Phase 2 — RAMPAGE",
      "Phase 3 — LAND THE ARTIFACTS",
      "Phase 4 — VALIDATION LOOP",
      "Phase 5 — TL;DR",
    ]) {
      assert.ok(RAMPAGE_BRIEF.includes(phase), `missing phase marker: ${phase}`)
    }
  })

  it("pins the subagent fleet mechanics", () => {
    for (const marker of [
      "ask_user_question",
      "subagent",
      "workflow",
      "subagent_fork",
      "todo_write",
      "ALL IN ONE MESSAGE",
    ]) {
      assert.ok(RAMPAGE_BRIEF.includes(marker), `missing tool/mechanic reference: ${marker}`)
    }
  })

  it("pins the citation + verification discipline", () => {
    for (const marker of ["web_search", "web_fetch", "[UNVERIFIED]", "never invent", "Wave 2", "adversarial"]) {
      assert.ok(RAMPAGE_BRIEF.includes(marker), `missing discipline marker: ${marker}`)
    }
  })

  it("pins the non-negotiables header and the momentum rule (silence or 'go' ramps on assumptions)", () => {
    assert.ok(RAMPAGE_BRIEF.includes("Non-negotiables"))
    assert.ok(RAMPAGE_BRIEF.includes("just go"))
    assert.ok(/STATED ASSUMPTIONS ON RECORD/i.test(RAMPAGE_BRIEF))
  })

  it("pins the validation loop: fresh auditor, links must HOLD their claims, fixers, capped rounds", () => {
    for (const marker of [
      "brand new every round",
      "web_fetch` EVERY load-bearing citation",
      "HOLD the claim",
      "defect table",
      "fixer",
      "VALIDATION DISCLOSURE",
    ]) {
      assert.ok(RAMPAGE_BRIEF.includes(marker), `missing validation-loop marker: ${marker}`)
    }
    assert.ok(/≤3 rounds/.test(RAMPAGE_BRIEF), "the loop is capped")
    assert.ok(RAMPAGE_BRIEF.includes("into the TL;DR"), "residual defects reach the TL;DR")
    assert.ok(RAMPAGE_BRIEF.includes("A PASS finalizes the run"), "the gate can actually pass")
  })

  it("pins the artifact contract (markdown + optional interactive site) and the TL;DR", () => {
    for (const marker of ["report.md", "site.html", "file://", "source index", "present", "TL;DR"]) {
      assert.ok(RAMPAGE_BRIEF.includes(marker), `missing artifact marker: ${marker}`)
    }
    assert.ok(RAMPAGE_BRIEF.includes("deep-research/"), "default output directory named")
  })

  it("pins the serving constraints inherited from the workspace port conventions", () => {
    assert.ok(RAMPAGE_BRIEF.includes("0.0.0.0"), "served previews bind 0.0.0.0")
    assert.ok(RAMPAGE_BRIEF.includes("http://studio:"), "served previews use the studio hostname")
    assert.ok(RAMPAGE_BRIEF.includes("/tmp/opencode/proto/"), "never serve the workspace directly")
    assert.ok(RAMPAGE_BRIEF.includes("4500–4504"), "only the reserved prototype ports are used")
  })

  it("pins the mode select + Agent Teams plumbing", () => {
    for (const marker of ["MODE SELECT", "TEAM MODE", "FLEET MODE", "spawn_teammate", "wait_agent", "send_message", "interrupt_agent"]) {
      assert.ok(RAMPAGE_BRIEF.includes(marker), `missing mode/team marker: ${marker}`)
    }
    assert.ok(/≤6 running at once|≤6 active/.test(RAMPAGE_BRIEF), "teams concurrency cap stated")
  })

  it("pins the writer contract (one writer: format + writing only, no research/validate/dispatch)", () => {
    for (const marker of [
      "Exactly ONE writer",
      "does not research",
      "does not validate",
      "It DECIDES the format",
      "uncited-material",
    ]) {
      assert.ok(RAMPAGE_BRIEF.includes(marker), `missing writer marker: ${marker}`)
    }
  })

  it("pins the shared pool as the single source of truth", () => {
    for (const marker of ["shared pool", "<out>/findings/", "single source of truth", "only input"]) {
      assert.ok(RAMPAGE_BRIEF.includes(marker), `missing pool marker: ${marker}`)
    }
  })

  it("is a substantive protocol, not a stub", () => {
    assert.ok(RAMPAGE_BRIEF.length > 4000, `brief is suspiciously short: ${RAMPAGE_BRIEF.length} chars`)
  })
})
