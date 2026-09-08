// Rewrites registry-looking specs for the unpublished @hive/* cohort to the
// local tarballs, for every package in the graph. pnpm overrides do not
// reliably reach the dependencies of `file:` tarballs (see the dsh
// publish-playbook field report), so this readPackage hook does it instead.
const TARBALLS = {
  "@hive/dsh-agents": "file:./hive-dsh-agents-0.0.1.tgz",
  "@hive/dsh-dream-archive": "file:./hive-dsh-dream-archive-0.0.1.tgz",
  "@hive/dsh-evolution": "file:./hive-dsh-evolution-0.0.1.tgz",
  "@hive/dsh-hivemind": "file:./hive-dsh-hivemind-0.0.1.tgz",
  "@hive/dsh-painpoints": "file:./hive-dsh-painpoints-0.0.1.tgz",
  "@hive/dsh-tools": "file:./hive-dsh-tools-0.0.1.tgz",
  "dsh-berget-refresh": "file:./dsh-berget-refresh-0.1.0.tgz",
}

function rewriteDeps(pkg, field) {
  for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
    if (TARBALLS[name] && !spec.startsWith("file:")) pkg[field][name] = TARBALLS[name]
  }
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      rewriteDeps(pkg, "dependencies")
      rewriteDeps(pkg, "devDependencies")
      rewriteDeps(pkg, "optionalDependencies")
      return pkg
    },
  },
}
