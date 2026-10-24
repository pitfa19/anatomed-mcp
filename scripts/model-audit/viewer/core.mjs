import path from 'node:path'
import crypto from 'node:crypto'

export function safeChild(root, relative) {
  const resolved = path.resolve(root, relative)
  if (resolved !== path.resolve(root) && !resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Path escapes root')
  return resolved
}

// Hash keeps punctuation, suffixes and loader collision names distinct without unsafe filenames.
export function recordKey(kind, system, id, index = '') {
  return `${kind}-${system.replace(/[^a-zA-Z0-9_-]/g, '_')}-${crypto.createHash('sha256').update(JSON.stringify([id, index])).digest('hex').slice(0, 24)}`
}

export function summarize(records, expected) {
  const counts = { expected, completed: records.length, passed: 0, failed: 0, errors: 0 }
  for (const r of records) {
    if (r.status === 'pass-structural') counts.passed++
    else if (r.status === 'error') counts.errors++
    else counts.failed++
  }
  return { ...counts, complete: counts.completed === expected }
}
