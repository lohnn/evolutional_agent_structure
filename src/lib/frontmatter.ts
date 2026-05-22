import path from "path"
import fs from "fs"

export interface Frontmatter {
  [key: string]: string | Record<string, string>
}

export interface MdFile {
  frontmatter: Frontmatter
  body: string
}

export interface MdEntry extends MdFile {
  name: string
}

/**
 * Minimal YAML frontmatter parser.
 * Supports flat key-value pairs and one level of nested blocks.
 */
export function parseFrontmatter(content: string): MdFile {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const fmStr = match[1]
  const body = match[2]
  const frontmatter: Frontmatter = {}

  let inNestedBlock = false
  let nestedKey: string | null = null
  let nestedObj: Record<string, string> = {}

  function saveState() {
    if (inNestedBlock && nestedKey) {
      frontmatter[nestedKey] = nestedObj
      inNestedBlock = false
      nestedKey = null
      nestedObj = {}
    }
  }

  for (const line of fmStr.split("\n")) {
    if (line.trim() === "") continue

    const topMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (topMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      saveState()
      const key = topMatch[1]
      const val = topMatch[2].trim()

      if (val === "") {
        inNestedBlock = true
        nestedKey = key
        nestedObj = {}
      } else {
        frontmatter[key] = val.replace(/^["']|["']$/g, "")
      }
      continue
    }

    if (inNestedBlock) {
      const nestedMatch = line.match(/^\s+([a-zA-Z_*"'-][a-zA-Z_*0-9"'-]*):\s*(.*)$/)
      if (nestedMatch) {
        const nk = nestedMatch[1].replace(/^["']|["']$/g, "")
        const nv = nestedMatch[2].trim().replace(/^["']|["']$/g, "")
        nestedObj[nk] = nv
      }
    }
  }
  saveState()

  return { frontmatter, body }
}

export function readMdFile(filePath: string): MdFile {
  const content = fs.readFileSync(filePath, "utf8")
  return parseFrontmatter(content)
}

export function readMdDir(dirPath: string, suffix = ".md"): MdEntry[] {
  if (!fs.existsSync(dirPath)) return []
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(suffix))
    .map((f) => {
      const { frontmatter, body } = readMdFile(path.join(dirPath, f))
      const name = f.replace(suffix, "")
      return { name, frontmatter, body }
    })
}
