// Sanity-check the openWakeWord ONNX pipeline (shapes + end-to-end score).
// Run: node scripts/verify-oww.mjs
import * as ort from 'onnxruntime-web'
import { fileURLToPath } from 'url'
import path from 'path'

ort.env.wasm.numThreads = 1

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer/public/oww')

async function load(name) {
  const session = await ort.InferenceSession.create(path.join(dir, name))
  console.log(`\n=== ${name}`)
  console.log('inputs :', session.inputNames)
  console.log('outputs:', session.outputNames)
  return session
}

const mel = await load('melspectrogram.onnx')
const emb = await load('embedding_model.onnx')
const cls = await load('hey_jarvis_v0.1.onnx')

// --- melspectrogram: feed one 1280-sample chunk of silence-ish noise
const chunk = new Float32Array(1280).map(() => (Math.random() - 0.5) * 0.01)
const melOut = await mel.run({ [mel.inputNames[0]]: new ort.Tensor('float32', chunk, [1, 1280]) })
const melTensor = melOut[mel.outputNames[0]]
console.log('\nmel output dims for [1,1280] input:', melTensor.dims)

// --- embedding: needs 76 mel frames x 32 bins
const melFrames = []
for (let i = 0; i < 20; i++) {
  const c = new Float32Array(1280).map(() => (Math.random() - 0.5) * 0.01)
  const o = await mel.run({ [mel.inputNames[0]]: new ort.Tensor('float32', c, [1, 1280]) })
  const t = o[mel.outputNames[0]]
  const frames = t.dims[t.dims.length - 2] // frames dimension
  const data = t.data
  for (let f = 0; f < frames; f++) {
    const row = new Float32Array(32)
    for (let b = 0; b < 32; b++) row[b] = data[f * 32 + b] / 10 + 2 // oww transform
    melFrames.push(row)
  }
}
console.log('collected mel frames:', melFrames.length)

const window76 = melFrames.slice(-76)
const embIn = new Float32Array(76 * 32)
window76.forEach((row, i) => embIn.set(row, i * 32))
const embOut = await emb.run({ [emb.inputNames[0]]: new ort.Tensor('float32', embIn, [1, 76, 32, 1]) })
const embTensor = embOut[emb.outputNames[0]]
console.log('embedding output dims:', embTensor.dims)

// --- classifier: 16 embeddings x 96
const embSize = embTensor.data.length
const clsIn = new Float32Array(16 * embSize)
for (let i = 0; i < 16; i++) clsIn.set(embTensor.data, i * embSize)
const clsOut = await cls.run({ [cls.inputNames[0]]: new ort.Tensor('float32', clsIn, [1, 16, embSize]) })
const score = clsOut[cls.outputNames[0]]
console.log('classifier output dims:', score.dims, 'score:', Array.from(score.data))
console.log('\n✓ pipeline runs end-to-end')
