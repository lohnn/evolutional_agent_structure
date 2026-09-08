// Phase-1 gate: boot a cordis Context, mount the dream-archive Service via the
// class-plugin path (the same shape the loader uses), and exercise every
// service method group against a real-archive COPY plus a synthetic workspace.
import { Context } from "@deepseek-ai/cordis"
import DreamArchive from "@hive/dsh-dream-archive"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

const results = []
const check = (id, ok, detail) => {
  results.push({ id, ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

// Real-archive copy (read-heavy methods hit this)
const realCopy = fs.mkdtempSync(path.join(os.tmpdir(), "p1-real-"))
fs.cpSync("/workspace/.opencode/dreams", path.join(realCopy, ".opencode/dreams"), { recursive: true })

// Synthetic workspace (write methods hit this — never the live archive)
const synth = fs.mkdtempSync(path.join(os.tmpdir(), "p1-synth-"))
for (const sub of ["insights", "warnings", "songlines", "shadows"]) {
  fs.mkdirSync(path.join(synth, ".opencode/dreams/artifacts", sub), { recursive: true })
}
fs.mkdirSync(path.join(synth, ".opencode/dreams/active"), { recursive: true })
fs.mkdirSync(path.join(synth, ".opencode/dreams/history"), { recursive: true })
fs.mkdirSync(path.join(synth, ".opencode/dreams/raw"), { recursive: true })

// ── boot via class-plugin apply (loader shape) ─────────────────────────────
const ctx = new Context()
ctx.plugin(DreamArchive, { directory: realCopy })
await new Promise((r) => setTimeout(r, 50)) // let the fiber settle

check("boot.service-registered", typeof ctx.dreamArchive?.rank === "function", "ctx.dreamArchive exposed with methods")
check("boot.directory-config", ctx.dreamArchive.directory === realCopy, `directory wired from config (${ctx.dreamArchive.directory})`)

// ── read surface against the real archive copy ─────────────────────────────
const listAll = ctx.dreamArchive.list()
check("read.list", listAll.length > 80, `list() over real archive copy: ${listAll.length} artifacts`)

const q = ctx.dreamArchive.query({ domain_tags: ["dsh"] })
check("read.query-tags", q.total > 0 && q.mode === (q.total <= 20 ? "full" : "index"), `query(domain_tags:[dsh]) → ${q.total} hits, mode=${q.mode}`)

const ranked = ctx.dreamArchive.rank("dsh tool registration validation")
check("read.rank", ranked.results.length > 0 && ranked.backend === "token-v1", `rank() → top=${ranked.results[0]?.id} of ${ranked.total} (${ranked.backend})`)

const dup = ctx.dreamArchive.detectDuplicates(0.6)
check("read.detect-duplicates", Array.isArray(dup), `detectDuplicates(0.6) → ${dup.length} candidate pairs`)

const idFetch = ctx.dreamArchive.query({ ids: ["I-058", "W-040"] })
check("read.ids-exact-fetch", idFetch.total === 2, `query(ids:[I-058,W-040]) → ${idFetch.total} fetched`)

// ── DRM state reads ─────────────────────────────────────────────────────────
const active = ctx.dreamArchive.listActiveDreams()
check("read.active-dreams", Array.isArray(active), `listActiveDreams() → ${active.length} active`)
const preComp = ctx.dreamArchive.recentPreCompactionDreams(3)
check("read.pre-compaction-scan", Array.isArray(preComp), `recentPreCompactionDreams(3) → ${preComp.length}`)

// ── write surface on a SEPARATE service instance (synthetic workspace) ─────
const ctx2 = new Context()
ctx2.plugin(DreamArchive, { directory: synth })
await new Promise((r) => setTimeout(r, 50))
const arc2 = ctx2.dreamArchive

const beginRes = arc2.begin({
  depth: 2,
  intention: "phase-1 gate dream",
  intention_type: "CONSOLIDATION",
  entry_time: new Date().toISOString(),
  project_context: "dsh-hive gate",
  context_signals: { contradictions: 0, repetitions_detected: false, coherence: "HIGH", threads_active: 1 },
  retain_high: [],
  retain_low: [],
})
check("write.begin", beginRes.dreamId === "DRM-001" && fs.existsSync(beginRes.filePath), `begin() → ${beginRes.dreamId}`)

const artPath = arc2.writeArtifact({
  type: "insight",
  insight_id: arc2.nextArtifactId("insight"),
  source_dream: "DRM-001",
  confidence: 0.9,
  domain_tags: ["gate"],
  content: "phase-1 service gate artifact",
  actionable: true,
  previously_invisible_because: "gate",
})
check("write.artifact", fs.existsSync(artPath), `writeArtifact → ${path.basename(artPath)}`)

const completeRes = arc2.complete(new Date().toISOString(), ["I-001"])
check("write.complete", completeRes.dreamId === "DRM-001" && fs.existsSync(completeRes.historyPath), `complete() → history, linked ${completeRes.linkedArtifacts.insights.length} insight(s)`)

arc2.appendResidue("gate-cap", "ses_gate", "gate residue note", "note")
const harvested = arc2.harvest(true)
check("write.residue-harvest", harvested.length === 1 && harvested[0].content.includes("gate residue note"), `appendResidue+harvest → ${harvested.length} journal(s)`)

arc2.recordSurfacedEvent("ses_gate", "rank", "gate", ["I-001"], 1)
check("write.telemetry", fs.existsSync(path.join(synth, ".opencode/dreams/index/telemetry/ses_gate.jsonl")), "recordSurfacedEvent wrote jsonl")

// byte-identity spot check: the synthetic DRM file matches the serializer
const drmRaw = fs.readFileSync(completeRes.historyPath, "utf8")
check("format.drm-shape", drmRaw.includes("dream_id: DRM-001") && drmRaw.includes("status: COMPLETE") && drmRaw.includes("insights: [I-001]"), "DRM file shape: scalars rewritten, artifacts appended")

fs.rmSync(realCopy, { recursive: true, force: true })
fs.rmSync(synth, { recursive: true, force: true })

const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
