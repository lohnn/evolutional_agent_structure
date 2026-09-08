// One-shot converter: bun:test suite → node:test .mjs against dist output.
import fs from "fs"

const src = process.argv[2]
const dst = process.argv[3]
let s = fs.readFileSync(src, "utf8")

s = s.replace(
  'import { describe, test, expect, beforeEach, afterEach } from "bun:test"',
  'import { describe, test as it, beforeEach, afterEach } from "node:test"\nimport assert from "node:assert/strict"'
)
s = s.replace(/from "\.\.\/src\/(.*?)\.ts"/g, 'from "../dist/$1.js"')
// expect(...) assertions. Rewrite with a tiny scanner (not regex) so nested
// parens in the argument don't break the match. Handles the matchers used in
// the dream suites: toBe / toContain / toEqual / toBeFalsy / toBeTruthy.
function rewriteExpects(src) {
  const findMatching = (str, openIdx) => {
    let depth = 0
    for (let i = openIdx; i < str.length; i++) {
      const c = str[i]
      if (c === "(") depth++
      else if (c === ")") {
        depth--
        if (depth === 0) return i
      }
    }
    return -1
  }
  let out = ""
  let i = 0
  while (true) {
    const idx = src.indexOf("expect(", i)
    if (idx === -1) { out += src.slice(i); break }
    out += src.slice(i, idx)
    const argStart = idx + "expect(".length
    const argEnd = findMatching(src, argStart - 1) // index of the closing ')'
    if (argEnd === -1) { out += src.slice(idx); break }
    const arg = src.slice(argStart, argEnd)
    // matcher: .matcher(rest) immediately after
    const m = src.slice(argEnd + 1).match(/^\.(toBe|toContain|toEqual|toBeFalsy|toBeTruthy)\(\s*(\))?/)
    if (!m) { out += src.slice(idx, argEnd + 1); i = argEnd + 1; continue }
    const matcher = m[1]
    const emptyCall = m[2] === ")"
    const mArgStart = argEnd + 1 + m[0].length
    let mArg, consumedEnd
    if (emptyCall) {
      mArg = ""
      consumedEnd = mArgStart // regex already consumed the closing ')'
    } else {
      const closeIdx = findMatching(src, mArgStart - 1)
      if (closeIdx === -1) { out += src.slice(idx, argEnd + 1); i = argEnd + 1; continue }
      mArg = src.slice(mArgStart, closeIdx)
      consumedEnd = closeIdx + 1
    }
    let replacement
    switch (matcher) {
      case "toBe": replacement = `assert.equal(${arg}, ${mArg})`; break
      case "toContain": replacement = `assert.ok(${arg}.includes(${mArg}))`; break
      case "toEqual": replacement = `assert.deepEqual(${arg}, ${mArg})`; break
      case "toBeFalsy": replacement = `assert.ok(!(${arg}))`; break
      case "toBeTruthy": replacement = `assert.ok(${arg})`; break
    }
    out += replacement
    i = consumedEnd
  }
  return out
}
s = rewriteExpects(s)
s = s.replace(/\btest\(/g, "it(")

// Strip TS-only syntax that .mjs cannot carry:
//  - `type X` / `type X as Y` members inside import braces (line-based)
s = s.replace(/^(\s*)type\s+\w+(\s+as\s+\w+)?,?\s*$/gm, "")
//  - now-empty import braces: import {\n\n} from "x" → drop the whole statement
s = s.replace(/import\s*\{[\s,]*\}\s*from\s*"[^"]*";?\n?/g, "")
//  - dangling commas left in still-populated import braces
s = s.replace(/\{\s*,/g, "{").replace(/,\s*\}/g, " }")
//  - `as X` casts and type annotations on const/let/function params (conservative)
s = s.replace(/\s+as\s+const/g, "")
s = s.replace(/\s+as\s+[A-Z][A-Za-z]*(\[\])?/g, "")
s = s.replace(/:\s*Record<string, unknown>/g, "")
//  - `let x: T` / `const x: T` declarations (line-anchored, simple identifiers)
s = s.replace(/^(\s*(?:let|const|var)\s+\w+)\s*:\s*[A-Za-z][A-Za-z0-9_<>, \[\]|&"]*$/gm, "$1")

fs.writeFileSync(dst, s)
console.log(`converted ${src} -> ${dst}`)
