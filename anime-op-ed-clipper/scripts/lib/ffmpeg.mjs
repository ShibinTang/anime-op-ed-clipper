// ffmpeg 定位与参数构造。零依赖：显式路径 → 可选 npm 包 → PATH。
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

export const DEFAULTS = Object.freeze({
  seconds: 10,
  fadeIn: 0.2,
  fadeOut: 0.5,
  bitrate: '128k',
});

export function buildFfmpegArgs({
  input,
  output,
  seconds = DEFAULTS.seconds,
  fadeIn = DEFAULTS.fadeIn,
  fadeOut = DEFAULTS.fadeOut,
  bitrate = DEFAULTS.bitrate,
}) {
  const outAt = Math.max(0, Number(seconds) - Number(fadeOut));
  return [
    '-hide_banner', '-v', 'error', '-y',
    // -t 放在 -i 之前是输入选项：只解码前 N 秒，几百 MB 的 FLAC 也能秒出
    '-t', String(seconds),
    '-i', input,
    '-vn', '-map_metadata', '-1',
    '-af', `afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${outAt}:d=${fadeOut}`,
    '-c:a', 'libmp3lame', '-b:a', String(bitrate), '-ac', '2',
    output,
  ];
}

export async function resolveFfmpeg(explicit = '') {
  for (const p of [explicit, process.env.FFMPEG_PATH]) {
    if (p && existsSync(p)) return p;
  }
  try {
    const require = createRequire(import.meta.url);
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path && existsSync(installer.path)) return installer.path;
  } catch {
    // 未安装可选包时退回 PATH
  }
  return 'ffmpeg';
}

export function probeFfmpeg(ffmpeg) {
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, ['-version'], (err) => {
      if (err) {
        reject(new Error(`找不到可用的 ffmpeg（${ffmpeg}）。请安装 ffmpeg，或用 --ffmpeg / FFMPEG_PATH 指定路径。`));
      } else {
        resolve();
      }
    });
  });
}

export function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, args, { maxBuffer: 8 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().slice(-500)));
      else resolve();
    });
  });
}
