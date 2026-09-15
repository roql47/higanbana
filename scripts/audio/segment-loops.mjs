// Lossless chunks of the decoded source: preserve every sample and loop order.
// Run only when source audio changes; generated assets are shipped with the game.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/audio');
const manifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const key of ['amb/frogs', 'amb/higurashi']) {
  const spec = manifest.sounds[key];
  const source = resolve(root, spec.files[0]);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,channels', '-of', 'json', source], { encoding: 'utf8' });
  if (probe.status !== 0) throw Error(probe.stderr);
  const { sample_rate, channels } = JSON.parse(probe.stdout).streams[0];
  const sampleRate = Number(sample_rate);
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', source, '-f', 's24le', '-acodec', 'pcm_s24le', '-'], { maxBuffer: 128 * 1024 * 1024 });
  if (pcm.status !== 0) throw Error(pcm.stderr.toString());
  const frameBytes = channels * 3;
  const frames = pcm.stdout.length / frameBytes;
  const chunkFrames = sampleRate * 6;
  const chunks = [];
  await mkdir(resolve(root, key, 'stream'), { recursive: true });
  for (let start = 0, i = 0; start < frames; start += chunkFrames, i++) {
    const end = Math.min(frames, start + chunkFrames);
    const file = `${key}/stream/${i}.flac`;
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 's24le', '-ar', String(sampleRate), '-ac', String(channels), '-i', 'pipe:0', '-c:a', 'flac', '-compression_level', '8', resolve(root, file)], { input: pcm.stdout.subarray(start * frameBytes, end * frameBytes) });
    if (result.status !== 0) throw Error(result.stderr.toString());
    chunks.push({ file, frames: end - start });
  }
  spec.stream = { sampleRate, channels, chunks };
  console.log(`${key}: ${frames} frames, ${chunks.length} chunks; source retained for decoder fallback`);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, ' ') + '\n');
