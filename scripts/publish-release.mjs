// Deterministic release publisher — replaces electron-builder's GitHub
// publisher, which races when there are multiple targets (creates the release
// twice; second create 422s and uploads die half-finished).
//
// Flow: verify artifacts from the *current* build → create release if missing
// → upload all assets with --clobber → read latest.yml back from GitHub and
// verify it matches. Auth comes from the gh CLI (no GH_TOKEN needed).
//
// Usage: npm run release   (builds first, then runs this)
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const tag = `v${version}`
const repo = 'cre8ieguy/hearth'
const dir = path.join(root, 'release')

const assets = [
  `Hearth-${version}-setup.exe`,
  `Hearth-${version}-setup.exe.blockmap`,
  `Hearth-${version}-portable.exe`,
  'latest.yml',
]

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts })
}

// 1. All artifacts must exist and latest.yml must be from THIS build.
for (const name of assets) {
  const file = path.join(dir, name)
  if (!fs.existsSync(file)) {
    console.error(`✗ missing artifact: release/${name} — run the build first`)
    process.exit(1)
  }
}
const manifest = fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8')
if (!manifest.includes(`version: ${version}`)) {
  console.error(`✗ release/latest.yml is stale (expected version: ${version}):\n${manifest}`)
  process.exit(1)
}

// 2. Ensure the git tag exists on GitHub (non-draft releases require it).
try {
  run('git', ['ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`], { cwd: root })
} catch {
  console.error(`✗ tag ${tag} is not on GitHub — run: git push --follow-tags`)
  process.exit(1)
}

// 3. Create the release if it doesn't exist yet.
let exists = true
try {
  run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName'])
} catch {
  exists = false
}
if (!exists) {
  console.log(`creating release ${tag}…`)
  run('gh', ['release', 'create', tag, '--repo', repo, '--title', `Hearth ${tag}`, '--notes', `Hearth ${version}`])
}

// 4. Upload everything from this build (clobber = idempotent re-runs).
console.log(`uploading ${assets.length} assets…`)
run('gh', [
  'release',
  'upload',
  tag,
  ...assets.map((a) => path.join(dir, a)),
  '--repo',
  repo,
  '--clobber',
])

// 5. Verify the feed end-to-end.
const remote = run('gh', [
  'release',
  'view',
  tag,
  '--repo',
  repo,
  '--json',
  'assets',
  '--jq',
  '[.assets[].name] | sort | join(",")',
]).trim()
const missing = assets.filter((a) => !remote.split(',').includes(a))
if (missing.length > 0) {
  console.error(`✗ assets missing after upload: ${missing.join(', ')}`)
  process.exit(1)
}
console.log(`✓ ${tag} published with all assets — kiosks will pick it up within ~2h`)
