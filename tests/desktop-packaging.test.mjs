import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeSteamScripts } from '../scripts/steam-config.mjs';
import { sha256, verifyContent } from '../scripts/package-desktop.mjs';

test('Steam scripts require real numeric IDs and never publish by default', () => {
  for (const value of ['', '0', '-1', '4294967296', '123"\n"SetLive" "default']) {
    assert.throws(() => makeSteamScripts(value, '1234561'));
  }
  assert.throws(() => makeSteamScripts('1234560', '1234560'));
  const result = makeSteamScripts('1234560', '1234561');
  assert.match(result.app, /"Preview" "1"/);
  assert.doesNotMatch(result.app, /SetLive/);
  assert.match(result.depot, /"InstallScript" "installscript.vdf"/);
  assert.match(result.install, /Apps\\\\1234560/);
  assert.match(result.install, /\\"%INSTALLDIR%\\\\redist\\\\Install-WebView2.ps1\\"/);
});

test('desktop package catches missing audio, remote entry resources, corrupted fonts and source files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'higanbana-package-'));
  try {
    await mkdir(join(dir, 'audio/amb'), { recursive: true });
    await mkdir(join(dir, 'fonts'));
    await writeFile(join(dir, 'index.html'), '<html>Offline game</html>');
    await writeFile(join(dir, 'audio/manifest.json'), JSON.stringify({ sounds: { wind: { files: ['amb/wind.mp3'] } } }));
    await writeFile(join(dir, 'fonts/manifest.json'), JSON.stringify({ fonts: [{ file: 'test.woff2', sha256: sha256('font') }] }));
    await writeFile(join(dir, 'fonts/test.woff2'), 'font');
    await assert.rejects(verifyContent(dir), /ENOENT/);
    await writeFile(join(dir, 'audio/amb/wind.mp3'), 'audio');
    await verifyContent(dir);
    await writeFile(join(dir, 'index.html'), '<script src="https://example.com/game.js"></script>');
    await assert.rejects(verifyContent(dir), /remote resource/);
    await writeFile(join(dir, 'index.html'), '<html>Offline game</html>');
    await writeFile(join(dir, 'fonts/test.woff2'), 'broken');
    await assert.rejects(verifyContent(dir), /checksum/);
    await writeFile(join(dir, 'fonts/test.woff2'), 'font');
    await writeFile(join(dir, 'source.ts'), 'secret source');
    await assert.rejects(verifyContent(dir), /Development files/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
