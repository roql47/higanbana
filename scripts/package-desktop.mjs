import { build } from 'vite';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
import { STORY_ACTS } from '../src/story/phases.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-desktop');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function listFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error(`Symlinks are not distributable: ${join(dir, entry.name)}`);
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

export async function verifyContent(dir) {
  const html = await readFile(join(dir, 'index.html'), 'utf8');
  if (/(?:src|href)=["']https?:\/\//i.test(html)) throw Error('The desktop entry still loads a remote resource.');
  for (const match of html.matchAll(/(?:src|href)=["'](\/[^"']+)["']/g)) await stat(join(dir, match[1]));
  const audio = JSON.parse(await readFile(join(dir, 'audio/manifest.json'), 'utf8'));
  // Validate every sample path, including samples reached through manifest keys at runtime.
  for (const sound of Object.values(audio.sounds)) {
    for (const path of [...sound.files, ...(sound.stream?.chunks.map(chunk => chunk.file) ?? [])]) {
      if (path.includes('..') || /^[\\/]|^[a-z]+:/i.test(path)) throw Error(`Invalid audio path: ${path}`);
      await stat(join(dir, 'audio', path));
    }
  }
  const fonts = JSON.parse(await readFile(join(dir, 'fonts/manifest.json'), 'utf8'));
  for (const font of fonts.fonts) {
    if (sha256(await readFile(join(dir, 'fonts', font.file))) !== font.sha256) throw Error(`Font checksum mismatch: ${font.file}`);
  }
  const files = await listFiles(dir);
  const prohibited = files.filter(p => /(?:^|\/)(?:\.env|node_modules|\.git|voice-samples)(?:\/|$)|\.(?:map|blend|psd|ts)$/i.test(relative(dir, p)));
  if (prohibited.length) throw Error(`Development files in the package: ${prohibited.join(', ')}`);
  return files;
}

async function makeNotices() {
  const parts = ['Higanbana — third-party notices', 'Game art/audio credits remain in content/audio/CREDITS.md and the game credits.\n'];
  const packages = Object.keys(pkg.dependencies).map(name => join(root, 'node_modules', name, 'package.json'));
  const env = { ...process.env };
  const localCargo = join(root, '.build-tools/cargo');
  if (!env.CARGO_HOME && existsSync(localCargo)) {
    env.CARGO_HOME = localCargo; env.RUSTUP_HOME = join(root, '.build-tools/rustup');
    env.PATH = `${localCargo}/bin${delimiter}${env.PATH}`;
  }
  const cargo = spawnSync('cargo', ['metadata', '--locked', '--offline', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'], { cwd: root, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (cargo.status !== 0) throw Error(`Rust license metadata unavailable: ${cargo.stderr || cargo.error?.message}`);
  const crates = JSON.parse(cargo.stdout).packages.filter(p => p.name !== 'higanbana');
  const items = [...await Promise.all(packages.map(async file => {
    const p = JSON.parse(await readFile(file, 'utf8')); return { name: p.name, version: p.version, license: p.license, dir: dirname(file) };
  })), ...crates.map(p => ({ name: p.name, version: p.version, license: p.license, dir: dirname(p.manifest_path) }))];
  for (const item of items) {
    const names = (await readdir(item.dir)).filter(n => /^(?:licen[cs]e|copying|notice)(?:[.\-_]|$)/i.test(n));
    parts.push(`\n=== ${item.name} ${item.version} (${item.license ?? 'see source'}) ===`);
    for (const name of names) {
      const file = join(item.dir, name);
      if ((await stat(file)).isFile()) parts.push(await readFile(file, 'utf8'));
    }
  }
  await writeFile(join(dist, 'THIRD_PARTY_NOTICES.txt'), parts.join('\n'));
}

async function buildContent() {
  await build({ root, mode: 'desktop' });
  await rm(join(dist, 'voice-samples'), { recursive: true, force: true });
  await rm(join(dist, '_headers'), { force: true });
  await writeFile(join(dist, 'build-info.json'), JSON.stringify({ version: pkg.version,
    channel: 'development-preview', lastImplementedAct: Math.max(...STORY_ACTS.filter(a => a.implementation !== 'planned').map(a => a.no)),
    platform: 'desktop', runtime: 'Tauri 2 / system WebView', generatedAt: new Date().toISOString() }, null, 2) + '\n');
  await makeNotices();
  const files = await verifyContent(dist);
  let bytes = 0; for (const file of files) bytes += (await stat(file)).size;
  console.log(`Desktop content: ${files.length} files, ${(bytes / 1048576).toFixed(2)} MiB; no remote entry resources.`);
}

async function stage(platform) {
  if (!['windows-x64', 'macos-arm64'].includes(platform)) throw Error('Use --platform windows-x64 or macos-arm64.');
  await verifyContent(dist);
  const destination = join(root, 'release', platform);
  await mkdir(destination, { recursive: true });
  if (platform === 'windows-x64') {
    let binary = join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release/higanbana.exe');
    if (process.platform === 'win32') {
      try { await stat(binary); } catch { binary = join(root, 'src-tauri/target/release/higanbana.exe'); }
    }
    const bytes = await readFile(binary);
    if (bytes.toString('ascii', 0, 2) !== 'MZ' || bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4) !== 0x8664) throw Error('Expected a Windows x64 PE executable.');
    const redist = join(root, '.build-tools/redist/MicrosoftEdgeWebview2Setup.exe');
    await stat(redist);
    await cp(binary, join(destination, 'higanbana.exe'));
    await rm(join(destination, 'content'), { recursive: true, force: true });
    await cp(dist, join(destination, 'content'), { recursive: true });
    await mkdir(join(destination, 'redist'), { recursive: true });
    await cp(redist, join(destination, 'redist/MicrosoftEdgeWebview2Setup.exe'));
    await cp(join(root, 'scripts/Install-WebView2.ps1'), join(destination, 'redist/Install-WebView2.ps1'));
  } else {
    const app = join(root, 'src-tauri/target/release/bundle/macos/Higanbana.app');
    await stat(app);
    await rm(join(destination, 'Higanbana.app'), { recursive: true, force: true });
    await cp(app, join(destination, 'Higanbana.app'), { recursive: true, verbatimSymlinks: true });
    // Frontend-only optimization builds must not silently ship the bundle's old
    // content. Refresh the staged copy, leaving any running source app untouched.
    const stagedApp = join(destination, 'Higanbana.app');
    const content = join(stagedApp, 'Contents/Resources/content');
    await rm(content, { recursive: true, force: true });
    await cp(dist, content, { recursive: true });
    await verifyContent(content);
    if (process.platform !== 'darwin') throw Error('Stage the macOS development preview on macOS to refresh its ad-hoc signature.');
    const signed = spawnSync('codesign', ['--force', '--sign', '-', stagedApp], { encoding: 'utf8' });
    if (signed.status !== 0) throw Error(`macOS preview signature: ${signed.stderr || signed.error?.message}`);
    const verified = spawnSync('codesign', ['--verify', '--deep', '--strict', stagedApp], { encoding: 'utf8' });
    if (verified.status !== 0) throw Error(`macOS preview verification: ${verified.stderr}`);
  }
  await writeFile(join(destination, 'README.txt'), [
    '피안화 · Higanbana 0.1.0 — 개발 프리뷰 (ACT 18까지)',
    '',
    platform === 'windows-x64'
      ? '폴더 전체를 압축 해제한 뒤 higanbana.exe를 실행하세요. content 폴더를 함께 보관해야 합니다.\nWindows 10/11 64비트와 Microsoft WebView2 Runtime이 필요합니다.\nWebView2가 없다면 redist/MicrosoftEdgeWebview2Setup.exe를 먼저 실행하세요. 최초 런타임 설치에는 인터넷이 필요합니다.\nWindows 실기기 QA와 코드 서명은 아직 완료하지 않은 테스트 빌드입니다.'
      : 'Higanbana.app을 실행하세요. Apple Silicon Mac, macOS 13 이상용입니다.\n개발자 배포 서명·공증을 하지 않은 로컬 테스트 빌드입니다.',
    '', 'WASD 이동 · 마우스 시점 · Shift 달리기 · Esc 일시정지 · F 전체 화면',
    '저장은 게임 설치 폴더 밖의 앱 전용 프로필에 유지됩니다. Steam Cloud는 아직 지원하지 않습니다.',
    'ACT 16~17은 부분 구현이며 ACT 19~35와 후반 엔딩은 제작 전입니다.',
    '음원 출처와 폰트·소프트웨어 라이선스는 content 안에 포함되어 있습니다.',
    '',
  ].join('\n'));
  const files = await listFiles(destination);
  const entries = await Promise.all(files.filter(p => !p.endsWith('package-manifest.json')).map(async p => {
    const bytes = await readFile(p); return { path: relative(destination, p).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) };
  }));
  await writeFile(join(destination, 'package-manifest.json'), JSON.stringify({ platform, version: pkg.version,
    executable: platform === 'windows-x64' ? 'higanbana.exe' : 'Higanbana.app/Contents/MacOS/higanbana',
    runtimeTest: platform === 'windows-x64' ? 'requires Windows validation' : 'see packaging review', files: entries }, null, 2) + '\n');
  console.log(`Steam content folder: ${destination}\n${entries.length} files, ${(entries.reduce((n, f) => n + f.bytes, 0) / 1048576).toFixed(2)} MiB`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'build', ...args] = process.argv.slice(2);
  if (command === 'build') await buildContent();
  else if (command === 'verify') console.log(`Verified ${(await verifyContent(dist)).length} content files.`);
  else if (command === 'stage') await stage(args[args.indexOf('--platform') + 1]);
  else if (command === 'fetch-redist') {
    const response = await fetch('https://go.microsoft.com/fwlink/p/?LinkId=2124703');
    if (!response.ok) throw Error(`WebView2 download: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.toString('ascii', 0, 2) !== 'MZ') throw Error('WebView2 bootstrapper is not a PE executable.');
    await mkdir(join(root, '.build-tools/redist'), { recursive: true });
    await writeFile(join(root, '.build-tools/redist/MicrosoftEdgeWebview2Setup.exe'), bytes);
    console.log(`Official WebView2 bootstrapper: ${bytes.length} bytes, sha256 ${sha256(bytes)}`);
  } else throw Error(`Unknown command: ${command}`);
}
