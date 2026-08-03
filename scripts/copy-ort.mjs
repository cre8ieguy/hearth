// Copies onnxruntime-web's WASM runtime into the renderer's public dir so the
// wake-word engine can load it in dev (http) and production (app://).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules/onnxruntime-web/dist')
const dest = path.join(root, 'src/renderer/public/ort')

fs.mkdirSync(dest, { recursive: true })
const wanted = fs
  .readdirSync(src)
  .filter((f) => /^ort-wasm-simd-threaded(\.jsep)?\.(wasm|mjs)$/.test(f))
if (wanted.length === 0) {
  console.error('copy-ort: no ort wasm files found in', src)
  process.exit(1)
}
for (const f of wanted) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f))
}
console.log(`copy-ort: copied ${wanted.length} file(s) to src/renderer/public/ort`)
