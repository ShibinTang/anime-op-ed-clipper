#!/usr/bin/env node
// 命令行入口：把本地音频批量切成短 MP3 前奏，并产出 manifest.json
import { resolve, join } from 'node:path';
import { DEFAULTS } from './lib/ffmpeg.mjs';
import { processFiles } from './lib/pipeline.mjs';

const HELP = `
anime-op-ed-clipper — 把本地 OP/ED 音频切成短前奏

用法：
  node scripts/clip.mjs --in <目录或文件> --out <目录> [选项]

选项：
  --in <路径>          输入目录或单个音频文件（默认 ./input）
  --out <目录>         输出目录（默认 ./out）
  --seconds <秒>       截取时长，默认 ${DEFAULTS.seconds}
  --fade-in <秒>       淡入时长，默认 ${DEFAULTS.fadeIn}
  --fade-out <秒>      淡出时长，默认 ${DEFAULTS.fadeOut}
  --bitrate <码率>     MP3 码率，默认 ${DEFAULTS.bitrate}
  --concurrency <数>   并发数，默认 4
  --prefix <前缀>      manifest 里 audioUrl 的前缀，默认 /audio/op-ed；传 --prefix= 可置空
  --manifest <路径>    manifest 路径，默认 <out>/manifest.json
  --ffmpeg <路径>      指定 ffmpeg（也可用 FFMPEG_PATH 环境变量）
  --force              忽略增量缓存，全部重新生成
  --dry-run            只打印计划，不调用 ffmpeg、不写文件
  --help               显示本帮助

文件命名：动漫名 - 歌曲名.ext；片尾曲加 [ED]，例如「进击的巨人 - 美しき残酷な世界 [ED].flac」。
本工具不下载音频、不写数据库，请自备合法音频文件。
`;

function parseArgs(argv) {
  const out = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      positionals.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > 2) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return { flags: out, positionals };
}

const { flags, positionals } = parseArgs(process.argv.slice(2));
if (flags.help || flags.h) {
  console.log(HELP.trim());
  process.exit(0);
}

const out = resolve(String(flags.out ?? './out'));
const seconds = Number(flags.seconds ?? DEFAULTS.seconds);
const fadeIn = Number(flags['fade-in'] ?? DEFAULTS.fadeIn);
const fadeOut = Number(flags['fade-out'] ?? DEFAULTS.fadeOut);
const concurrency = Number(flags.concurrency ?? 4);

if (!Number.isFinite(seconds) || seconds <= 0) {
  console.error('--seconds 必须是正数');
  process.exit(1);
}
if (!Number.isFinite(fadeIn) || fadeIn < 0 || !Number.isFinite(fadeOut) || fadeOut < 0 || fadeIn + fadeOut > seconds) {
  console.error('--fade-in / --fade-out 必须为非负数，且两者之和不超过 --seconds');
  process.exit(1);
}
if (!Number.isInteger(concurrency) || concurrency < 1) {
  console.error('--concurrency 必须是正整数');
  process.exit(1);
}

const opts = {
  input: resolve(String(flags.in ?? positionals[0] ?? './input')),
  out,
  seconds,
  fadeIn,
  fadeOut,
  bitrate: String(flags.bitrate ?? DEFAULTS.bitrate),
  concurrency,
  prefix: flags.prefix === true ? '' : String(flags.prefix ?? '/audio/op-ed'),
  manifestPath: resolve(String(flags.manifest ?? join(out, 'manifest.json'))),
  ffmpeg: typeof flags.ffmpeg === 'string' ? flags.ffmpeg : '',
  force: Boolean(flags.force),
  dryRun: Boolean(flags['dry-run']),
  log: console.log,
};

try {
  console.log(`输入：${opts.input}`);
  console.log(`输出：${opts.out}${opts.dryRun ? '  (dry-run，不写文件)' : ''}`);
  const result = await processFiles(opts);
  console.log('');
  console.log(`共 ${result.total} 个文件：生成 ${result.created}，跳过 ${result.skipped}，计划 ${result.planned}，失败 ${result.failures.length}`);
  if (!opts.dryRun) console.log(`清单：${result.manifestPath}`);
  if (result.failures.length > 0) {
    for (const f of result.failures) console.error(`  - ${f.source}：${f.message}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`执行失败：${err.message}`);
  process.exit(1);
}
