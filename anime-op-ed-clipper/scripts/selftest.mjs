// 纯函数自测：不需要 ffmpeg、不需要音频文件，clone 下来即可跑
import assert from 'node:assert/strict';
import { parseName, slugFor, isAudioFile } from './lib/parse-name.mjs';
import { buildFfmpegArgs, DEFAULTS } from './lib/ffmpeg.mjs';
import { fingerprint, shouldSkip, renderOptions } from './lib/pipeline.mjs';

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`[ok] ${label}`);
}

check('OP 文件名解析', () => {
  assert.deepEqual(parseName('刀剑神域 - courage.flac'), {
    anime: '刀剑神域', song: 'courage', kind: 'OP',
  });
});

check('ED 标记识别与清理', () => {
  assert.deepEqual(parseName('进击的巨人 - 美しき残酷な世界 [ED].flac'), {
    anime: '进击的巨人', song: '美しき残酷な世界', kind: 'ED',
  });
  assert.equal(parseName('某作品 - 片尾曲 (片尾).mp3').kind, 'ED');
  assert.equal(parseName('某作品 - 主题曲 [OP1].mp3').kind, 'OP');
});

check('歌名中的连字符不被截断', () => {
  assert.equal(parseName('Re:Zero - Redo - ver.mp3').song, 'Redo - ver');
});

check('无分隔符时整名作为作品名', () => {
  assert.deepEqual(parseName('孤独摇滚.mp3'), {
    anime: '孤独摇滚', song: '', kind: 'OP',
  });
});

check('下划线分隔与中文标记', () => {
  assert.equal(parseName('鬼灭之刃_紅蓮華.m4a').song, '紅蓮華');
  assert.equal(parseName('鬼灭之刃 - 紅蓮華（片尾）.m4a').kind, 'ED');
});

check('扩展名白名单', () => {
  assert.equal(isAudioFile('a.FLAC'), true);
  assert.equal(isAudioFile('a.opus'), true);
  assert.equal(isAudioFile('cover.jpg'), false);
});

check('slug 稳定且带 hash', () => {
  const a = slugFor('刀剑神域 - courage.flac', '刀剑神域', 'courage');
  assert.equal(a, slugFor('刀剑神域 - courage.flac', '刀剑神域', 'courage'));
  assert.match(a, /^[a-z0-9-]+-[0-9a-f]{8}$/);
  assert.notEqual(a, slugFor('刀剑神域 - courage2.flac', '刀剑神域', 'courage'));
});

check('纯中文歌名回退到 track 前缀', () => {
  assert.match(slugFor('a.mp3', '某动漫', '青春コンプレックス'), /^track-[0-9a-f]{8}$/);
});

check('歌名无 ASCII 时回退用作品名', () => {
  assert.match(slugFor('a.mp3', 'Sword Art Online', '青春コンプレックス'), /^sword-art-online-/);
});

check('-t 必须在 -i 之前', () => {
  const args = buildFfmpegArgs({ input: 'in.flac', output: 'out.mp3' });
  assert.ok(args.indexOf('-t') < args.indexOf('-i'));
  assert.equal(args[args.indexOf('-t') + 1], String(DEFAULTS.seconds));
});

check('淡出起点 = 时长 - 淡出时长', () => {
  const args = buildFfmpegArgs({ input: 'a', output: 'b', seconds: 15, fadeOut: 1 });
  const af = args[args.indexOf('-af') + 1];
  assert.match(af, /afade=t=out:st=14:d=1/);
});

check('指纹随渲染参数变化', () => {
  const meta = { name: 'a.flac', size: 100, mtimeMs: 1000 };
  const opts = { seconds: 10, fadeIn: 0.2, fadeOut: 0.5, bitrate: '128k' };
  assert.equal(fingerprint(meta, renderOptions(opts)), fingerprint(meta, renderOptions(opts)));
  assert.notEqual(
    fingerprint(meta, renderOptions(opts)),
    fingerprint(meta, renderOptions({ ...opts, seconds: 20 })),
  );
  assert.notEqual(
    fingerprint(meta, renderOptions(opts)),
    fingerprint({ ...meta, size: 101 }, renderOptions(opts)),
  );
});

check('增量跳过规则', () => {
  const entry = { fingerprint: 'abc' };
  assert.equal(shouldSkip(entry, { fingerprint: 'abc' }, { outExists: true }), true);
  assert.equal(shouldSkip(entry, { fingerprint: 'old' }, { outExists: true }), false);
  assert.equal(shouldSkip(entry, { fingerprint: 'abc' }, { outExists: false }), false);
  assert.equal(shouldSkip(entry, { fingerprint: 'abc' }, { force: true, outExists: true }), false);
});

console.log(`\n全部通过：${passed} 项`);
