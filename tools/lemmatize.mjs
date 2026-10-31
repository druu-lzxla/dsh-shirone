#!/usr/bin/env node
// 按 tools/lemmas.tsv 给 words 列补第 5 段（辞书形），不动别的列。
//
//   node tools/lemmatize.mjs ja.a2.tsv ja.a2.out.tsv
//
// 只补"词面 ≠ 原形"的词；名词、固定说法原样保留。

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mapPath = join(here, 'lemmas.tsv')

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('用法：node tools/lemmatize.mjs <in.tsv> <out.tsv>')
  process.exit(2)
}

const map = new Map()
for (const line of readFileSync(mapPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('surface')) continue
  const [s, l] = line.split('\t').map((x) => x.trim())
  if (s && l) map.set(s, l)
}

const text = readFileSync(input, 'utf8').replace(/^\uFEFF/, '')
const lines = text.split(/\r?\n/)
let changed = 0
const out = lines.map((line, i) => {
  if (!line.trim() || i === 0) return line
  const cells = line.split('\t')
  if (cells.length < 6 || !cells[5]) return line
  cells[5] = cells[5].split(';').map((chunk) => {
    const parts = chunk.split('|')
    if (parts.length < 3) return chunk
    const lemma = map.get(parts[0].trim())
    if (!lemma || parts[4]) return chunk
    changed++
    while (parts.length < 4) parts.push('')
    parts[4] = lemma
    return parts.join('|')
  }).join(';')
  return cells.join('\t')
})

writeFileSync(output, out.join('\n'), 'utf8')
console.log(`补了 ${changed} 处辞书形 → ${output}`)
