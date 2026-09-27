// Dual-mode dependency rewrite for the unpublished @hive/* cohort.
//
// The plugins depend on each other by workspace/version specs that only make
// sense inside the dsh-hive monorepo or on npm — neither of which a consumer
// profile is. pnpm overrides do not reliably reach the dependencies of
// git-hosted or file:-tarball packages, so this readPackage hook rewrites
// those specs for every package in the graph instead.
//
// Mode is detected per install from the profile's own manifest:
//   GIT mode     — you added the plugins as git specs
//                  (github:owner/repo#ref&path:dsh-hive/packages/<pkg>).
//                  Sibling specs are rewritten to the SAME repo+ref, so
//                  re-running `dsh plugin add` upgrades the whole set.
//   TARBALL mode — default: sibling specs are rewritten to the .tgz files
//                  sitting next to this hook.
//
// IMPORTANT (git mode): always add all plugins in ONE `dsh plugin add`
// command — the hook learns the repo+ref template from that same command's
// specs, which are visible while pnpm resolves.

const PKG_PATHS = {
  "@hive/dsh-agents": "dsh-hive/packages/agents",
  "@hive/dsh-board": "dsh-hive/packages/board",
  "@hive/dsh-dream-archive": "dsh-hive/packages/dream-archive",
  "@hive/dsh-evolution": "dsh-hive/packages/evolution",
  "@hive/dsh-hivemind": "dsh-hive/packages/hivemind",
  "@hive/dsh-painpoints": "dsh-hive/packages/painpoints",
  "@hive/dsh-tools": "dsh-hive/packages/tools",
  "dsh-berget-refresh": "dsh-hive/packages/berget-refresh",
}

// TARBALLS rewrites use ABSOLUTE file paths anchored at this hook's own
// directory: relative file: specs inside an unpacked tarball's manifest are
// anchored by pnpm to the depending package's location in the virtual
// store, where the sibling tarballs do not exist ("Could not install from
// … as it does not exist"). The hook always lives either in the profile or
// the kit dir — both hold the tarballs — so __dirname is the one stable
// anchor (verified 2026-09-18, dsh 0.1.6-alpha.2 adoption gate).
const TARBALL_FILE = (name) => `file:${require("node:path").join(__dirname, name)}`

const TARBALLS = {
  "@hive/dsh-agents": TARBALL_FILE("hive-dsh-agents-0.0.1.tgz"),
  "@hive/dsh-board": TARBALL_FILE("hive-dsh-board-0.1.0.tgz"),
  "@hive/dsh-dream-archive": TARBALL_FILE("hive-dsh-dream-archive-0.0.1.tgz"),
  "@hive/dsh-evolution": TARBALL_FILE("hive-dsh-evolution-0.0.1.tgz"),
  "@hive/dsh-hivemind": TARBALL_FILE("hive-dsh-hivemind-0.0.1.tgz"),
  "@hive/dsh-painpoints": TARBALL_FILE("hive-dsh-painpoints-0.0.1.tgz"),
  "@hive/dsh-tools": TARBALL_FILE("hive-dsh-tools-0.0.1.tgz"),
  "dsh-berget-refresh": TARBALL_FILE("dsh-berget-refresh-0.1.0.tgz"),
  "dsh-berget-usage": TARBALL_FILE("dsh-berget-usage-0.2.0.tgz"),
  "dsh-provider-usage": TARBALL_FILE("dsh-provider-usage-0.1.0.tgz"),
  "dsh-web-search-searxng": TARBALL_FILE("dsh-web-search-searxng-0.5.0.tgz"),
}

// git+https://…/repo.git#ref&path:…  or  github:owner/repo#ref&path:…
const GIT_SPEC = /^(.+?)#([^&]+)&path:.+$/

// Default git template for git-mode first installs: a manifest scan can miss
// the profile's own new specs (pnpm `add` injects them in-memory), and
// readPackage call order is not guaranteed, so the fallback must not depend
// on having seen a spec. Default ref = main; override with env
// DSH_HIVE_REPO / DSH_HIVE_REF if you install from a fork or branch.
const GIT_FALLBACK = {
  base: process.env.DSH_HIVE_REPO ?? "git+https://github.com/lohnn/evolutional_agent_structure.git",
  ref: process.env.DSH_HIVE_REF ?? "main",
}

// TARBALL mode only when the packed tarballs sit next to this hook.
const HAS_TARBALLS = (() => {
  try {
    // eslint-disable-next-line no-undef -- this file is CommonJS
    return require("node:fs").existsSync(`${__dirname}/hive-dsh-dream-archive-0.0.1.tgz`)
  } catch {
    return false
  }
})()

let gitTemplate = HAS_TARBALLS ? null : GIT_FALLBACK

function depsOf(pkg, field) {
  return Object.entries(pkg[field] ?? {})
}

function scanForTemplate(pkg) {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, spec] of depsOf(pkg, field)) {
      if (!PKG_PATHS[name] || typeof spec !== "string") continue
      const m = GIT_SPEC.exec(spec)
      if (m) gitTemplate = { base: m[1], ref: m[2] }
    }
  }
}

function rewriteDeps(pkg, field) {
  for (const [name, spec] of depsOf(pkg, field)) {
    const subdir = PKG_PATHS[name]
    if (!subdir || typeof spec !== "string") continue
    if (GIT_SPEC.test(spec)) continue // already a pinned git spec — leave it
    if (spec.startsWith("file:")) continue // already local — leave it
    pkg[field][name] = gitTemplate
      ? `${gitTemplate.base}#${gitTemplate.ref}&path:${subdir}`
      : TARBALLS[name]
  }
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      scanForTemplate(pkg)
      rewriteDeps(pkg, "dependencies")
      rewriteDeps(pkg, "devDependencies")
      rewriteDeps(pkg, "optionalDependencies")
      return pkg
    },
  },
}
