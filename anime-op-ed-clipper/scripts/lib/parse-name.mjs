// 文件名 → 结构化元数据。纯函数，不碰文件系统，方便单测。
// 命名约定：动漫名 - 歌曲名.ext，片尾曲在歌名后加 [ED] / (片尾) 标记。
import { basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

export const AUDIO_EXT = new Set([
  '.flac', '.mp3', '.m4a', '.wav', '.ogg', '.aac', '.opus', '.wma',
]);

// 只认带括号的标记，避免把歌名里出现的 "ed" 当成片尾
const KIND_MARK = /[\[(（]\s*(op|ed|opening|ending|片头|片尾)(曲)?\s*\d*\s*[\])）]/gi;
const ED_MARK = /[\[(（]\s*(ed|ending|片尾)(曲)?\s*\d*\s*[\])）]/i;

// 只按「两侧带空格的横线」或下划线切分，避免误伤歌名里的连字符
const SEP = /\s+[-–—－]\s+|_/;

export const isAudioFile = (name) => AUDIO_EXT.has(extname(String(name)).toLowerCase());

export function parseName(fileName) {
  const base = basename(String(fileName), extname(String(fileName)));
  const kind = ED_MARK.test(base) ? 'ED' : 'OP';
  const cleaned = base.replace(KIND_MARK, '').trim();

  const idx = cleaned.search(SEP);
  let anime = cleaned;
  let song = '';
  if (idx > 0) {
    anime = cleaned.slice(0, idx).trim();
    song = cleaned.slice(idx).replace(SEP, '').trim();
  }
  return { anime: anime || cleaned, song, kind };
}

function asciiPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

// 文件名带 hash 后缀，保证不同来源、同名歌曲不会互相覆盖
export function slugFor(sourceRef, anime = '', song = '') {
  const hash = createHash('sha1').update(String(sourceRef)).digest('hex').slice(0, 8);
  const label = asciiPart(song) || asciiPart(anime);
  return label ? `${label}-${hash}` : `track-${hash}`;
}
