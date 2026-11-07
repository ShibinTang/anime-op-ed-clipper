// 批量编排：扫描 → 指纹增量 → 并发切片 → manifest 落盘。
// 刻意不写数据库、不下载音频，输出交给调用方自行对接。
import {
  statSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { parseName, slugFor, isAudioFile } from './parse-name.mjs';
import {
  buildFfmpegArgs, runFfmpeg, probeFfmpeg, resolveFfmpeg, DEFAULTS,
} from './ffmpeg.mjs';

export function renderOptions(opts) {
  return {
    seconds: opts.seconds ?? DEFAULTS.seconds,
    fadeIn: opts.fadeIn ?? DEFAULTS.fadeIn,
    fadeOut: opts.fadeOut ?? DEFAULTS.fadeOut,
    bitrate: opts.bitrate ?? DEFAULTS.bitrate,
  };
}

// 指纹只由「文件名 + 大小 + mtime + 渲染参数」组成，不读整文件，扫描再大的目录也很快
export function fingerprint(meta, render) {
  return createHash('sha1')
    .update(`${meta.name}|${meta.size}|${Math.round(meta.mtimeMs)}|${JSON.stringify(render)}`)
    .digest('hex')
    .slice(0, 16);
}

export function shouldSkip(entry, previous, { force = false, outExists = false } = {}) {
  if (force) return false;
  return outExists && previous?.fingerprint === entry.fingerprint;
}

export function listAudioFiles(input) {
  if (!existsSync(input)) throw new Error(`输入路径不存在：${input}`);
  if (statSync(input).isFile()) {
    if (!isAudioFile(input)) throw new Error(`不是支持的音频格式：${input}`);
    return [input];
  }
  return readdirSync(input)
    .filter((f) => isAudioFile(f))
    .filter((f) => statSync(join(input, f)).isFile())
    .sort()
    .map((f) => join(input, f));
}

export function buildEntry(filePath, opts) {
  const name = basename(filePath);
  const { anime, song, kind } = parseName(name);
  const slug = slugFor(name, anime, song);
  const output = `${slug}.mp3`;
  const st = statSync(filePath);
  const prefix = String(opts.prefix ?? '').replace(/\/+$/, '');

  return {
    slug,
    source: name,
    output,
    audioUrl: prefix ? `${prefix}/${output}` : output,
    anime,
    song,
    kind,
    fingerprint: fingerprint({ name, size: st.size, mtimeMs: st.mtimeMs }, renderOptions(opts)),
    srcPath: filePath,
    outPath: join(opts.out, output),
  };
}

// manifest 里不写本机绝对路径，方便随产物一起分发
function publicRecord(entry, bytes, status) {
  return {
    source: entry.source,
    output: entry.output,
    audioUrl: entry.audioUrl,
    anime: entry.anime,
    song: entry.song,
    kind: entry.kind,
    slug: entry.slug,
    fingerprint: entry.fingerprint,
    bytes,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function readManifest(path) {
  try {
    const rows = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(rows)) return new Map();
    return new Map(rows.map((r) => [r.slug, r]));
  } catch {
    return new Map();
  }
}

export function writeManifest(path, map) {
  const rows = [...map.values()].sort((a, b) => String(a.output).localeCompare(String(b.output)));
  writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}

export async function processFiles(opts) {
  const { out, force, dryRun, concurrency, manifestPath, log = console.log } = opts;
  if (!dryRun) mkdirSync(out, { recursive: true });

  const ffmpegPath = await resolveFfmpeg(opts.ffmpeg);
  if (!dryRun) await probeFfmpeg(ffmpegPath);

  const entries = listAudioFiles(opts.input).map((f) => buildEntry(f, opts));
  const manifest = readManifest(manifestPath);
  const results = [];
  const failures = [];
  const queue = [...entries];

  async function worker() {
    while (queue.length > 0) {
      const e = queue.shift();
      const previous = manifest.get(e.slug);
      const outExists = existsSync(e.outPath);

      if (dryRun) {
        const skipped = shouldSkip(e, previous, { force, outExists });
        log(`[计划] ${e.source} -> ${e.output}  ${e.kind} / ${e.anime}${e.song ? ` / ${e.song}` : ''}${skipped ? '  (可跳过)' : ''}`);
        results.push({ ...publicRecord(e, previous?.bytes ?? null, skipped ? 'would-skip' : 'planned') });
        continue;
      }

      if (shouldSkip(e, previous, { force, outExists })) {
        log(`[跳过] ${e.source}`);
        results.push({ ...previous, status: 'skipped' });
        continue;
      }

      try {
        const args = buildFfmpegArgs({
          ...renderOptions(opts), input: e.srcPath, output: e.outPath,
        });
        await runFfmpeg(ffmpegPath, args);
        const bytes = statSync(e.outPath).size;
        const record = publicRecord(e, bytes, 'created');
        manifest.set(e.slug, record);
        results.push(record);
        log(`[完成] ${e.source} -> ${e.output}  ${(bytes / 1024).toFixed(0)} KB`);
      } catch (err) {
        failures.push({ source: e.source, message: err.message });
        log(`[失败] ${e.source}：${err.message}`);
      }
    }
  }

  const workers = Math.min(Math.max(1, concurrency), Math.max(1, entries.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (!dryRun) writeManifest(manifestPath, manifest);

  return {
    total: entries.length,
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    planned: results.filter((r) => r.status === 'planned' || r.status === 'would-skip').length,
    failures,
    manifestPath,
    entries: results,
  };
}
