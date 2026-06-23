import { readFileSync, writeFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version

// 同步 Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml'
let cargo = readFileSync(cargoPath, 'utf-8')
cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${version}"`)
writeFileSync(cargoPath, cargo)

// 同步 tauri.conf.json
const tauriPath = 'src-tauri/tauri.conf.json'
const tauriConf = JSON.parse(readFileSync(tauriPath, 'utf-8'))
tauriConf.version = version
writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + '\n')

console.log(`version synced to ${version}`)
