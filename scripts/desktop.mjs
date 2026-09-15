import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const cargoHome = resolve(root, '.build-tools/cargo');
if (!env.CARGO_HOME && existsSync(cargoHome)) {
  env.CARGO_HOME = cargoHome;
  env.RUSTUP_HOME = resolve(root, '.build-tools/rustup');
  env.PATH = `${cargoHome}/bin${delimiter}${env.PATH}`;
}
const [command = 'build', ...args] = process.argv.slice(2);
const crossWindows = args.includes('x86_64-pc-windows-msvc') && process.platform !== 'win32';
if (crossWindows) {
  for (const path of ['/opt/homebrew/opt/llvm/bin', '/opt/homebrew/opt/lld/bin', '/usr/local/opt/llvm/bin']) {
    if (existsSync(path)) env.PATH = `${path}${delimiter}${env.PATH}`;
  }
  env.XWIN_CACHE_DIR ??= resolve(root, '.build-tools/xwin');
}
let result;
if (command === 'test') {
  result = spawnSync('cargo', ['test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', ...args], { cwd: root, env, stdio: 'inherit' });
} else {
  const cli = resolve(root, 'node_modules/@tauri-apps/cli/tauri.js');
  result = spawnSync(process.execPath, [cli, command, ...(crossWindows && command === 'build' ? ['--runner', 'cargo-xwin'] : []), ...args], { cwd: root, env, stdio: 'inherit' });
}
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
