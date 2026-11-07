# anime-op-ed-clipper

> Turn local anime OP/ED audio into short MP3 intro clips + a machine-readable manifest. Zero npm dependencies, no downloader, no database.

把本地动漫 OP/ED 音频批量切成短前奏（默认 10 秒 MP3），并按文件名解析出「作品名 / 歌名 / OP 或 ED」，产出 `manifest.json` 供答题题库或其他应用导入。

## 解决什么问题

做「听前奏猜动漫」这类游戏时，需要把几十上百首完整歌曲变成体积很小、长度统一、能直接被网页播放的片段，还要保证：

- 文件名稳定不冲突（同名歌曲来自不同作品也能共存）
- 重复运行不重复干活（改了源文件或参数才重新生成）
- 有结构化元数据可以入库，而不是一堆只有文件名的 mp3

这个工具只负责这一件事，且**完全离线**。

## 功能

- `ffmpeg` 只解码前 N 秒 → 淡入淡出 → `libmp3lame` 128 kbps 立体声 MP3（10 秒约 150 KB）
- 支持 `.flac .mp3 .m4a .wav .ogg .aac .opus .wma`，可传单文件或整个目录
- 文件名解析：`动漫名 - 歌曲名.ext`，`[ED]` / `（片尾）` 标记为片尾曲
- 稳定 slug：ASCII 标签 + 源文件名哈希，避免覆盖
- 指纹增量：文件名 + 大小 + mtime + 渲染参数，未变化自动跳过
- 并发处理（默认 4）、失败逐条报告、不中断整批
- 产出 `manifest.json`，不含本机绝对路径，方便随产物分发
- 纯函数自带 13 项自测，不需要 ffmpeg 也能跑

## 不包含什么

| 不做 | 原因 |
| --- | --- |
| 下载歌曲 / 视频 | 版权风险；请自备合法音频 |
| 写数据库 | 输出 manifest，由你决定表结构 |
| 附带任何音频素材 | 仓库只放代码与文档 |
| 图形界面 | 一个 CLI 更容易被 Agent 和 CI 调用 |

## 安装

**作为 Agent Skill（推荐）**

```bash
npx skills add ShibinTang/anime-op-ed-clipper
```

或把本仓库整个目录复制到你的 skills 目录（例如 `~/.workbuddy/skills/anime-op-ed-clipper/`、
`~/.claude/skills/anime-op-ed-clipper/`），Agent 会通过 `SKILL.md` 自动发现它。

**直接当 CLI 用**

```bash
git clone https://github.com/ShibinTang/anime-op-ed-clipper.git
cd anime-op-ed-clipper
node scripts/selftest.mjs
```

前置条件：Node.js ≥ 18、系统 `ffmpeg`（或设置 `FFMPEG_PATH` / 用 `--ffmpeg` 指定）。
**不需要 `npm install`。**

## 快速开始

把音频按约定命名放进输入目录：

```
input/
├── 刀剑神域 - courage.flac
└── 进击的巨人 - 美しき残酷な世界 [ED].flac
```

先预览（不写任何文件）：

```bash
node scripts/clip.mjs --in ./input --out ./out --dry-run
```

再执行：

```bash
node scripts/clip.mjs --in ./input --out ./out
```

输出：

```
输入：F:\...\input
输出：F:\...\out
[完成] 刀剑神域 - courage.flac -> courage-a1b2c3d4.mp3  156 KB
[完成] 进击的巨人 - 美しき残酷な世界 [ED].flac -> track-e5f6a7b8.mp3  154 KB

共 2 个文件：生成 2，跳过 0，计划 0，失败 0
清单：F:\...\out\manifest.json
```

再次运行同样的命令，两行都会显示 `[跳过]`。

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--in` | `./input` | 输入目录或单个音频文件 |
| `--out` | `./out` | 输出目录 |
| `--seconds` | `10` | 截取时长（秒） |
| `--fade-in` | `0.2` | 淡入时长 |
| `--fade-out` | `0.5` | 淡出时长 |
| `--bitrate` | `128k` | MP3 码率 |
| `--concurrency` | `4` | 并发数 |
| `--prefix` | `/audio/op-ed` | manifest 里 `audioUrl` 的前缀；`--prefix=` 置空 |
| `--manifest` | `<out>/manifest.json` | 清单路径 |
| `--ffmpeg` | 自动探测 | 指定 ffmpeg 可执行文件 |
| `--force` | 关 | 忽略增量缓存，全部重生成 |
| `--dry-run` | 关 | 只打印计划，不调用 ffmpeg |

也支持 `--key=value` 写法，以及把输入路径作为第一个位置参数。

## manifest.json

```json
[
  {
    "source": "刀剑神域 - courage.flac",
    "output": "courage-a1b2c3d4.mp3",
    "audioUrl": "/audio/op-ed/courage-a1b2c3d4.mp3",
    "anime": "刀剑神域",
    "song": "courage",
    "kind": "OP",
    "slug": "courage-a1b2c3d4",
    "fingerprint": "9c1f...",
    "bytes": 159744,
    "status": "created",
    "updatedAt": "2026-11-07T01:00:00.000Z"
  }
]
```

完整示例见 `examples/manifest.sample.json`。

## 对接自己的题库

manifest 是刻意与数据库解耦的。以 MySQL 为例，按 `audioUrl` 幂等 upsert 即可：

```sql
INSERT INTO guess_questions (category_id, prompt, answer, aliases, audio_url, explanation)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE answer = VALUES(answer), explanation = VALUES(explanation);
```

字段映射建议：`answer` ← `anime`，`aliases` ← `[song, anime]`，`audio_url` ← `audioUrl`，
`prompt` ← 依据 `kind` 生成「听这段前奏，猜这是哪部动漫的 OP？」。
更多说明见 `references/naming-convention.md`。

## 测试

```bash
node scripts/selftest.mjs
# 或 npm test
```

自测覆盖文件名解析、ED 标记、连字符歌名、slug 稳定性、ffmpeg 参数顺序、
指纹失效条件与增量跳过规则，共 13 项，不依赖 ffmpeg 和任何音频文件。

## 常见问题

**找不到 ffmpeg** — 装好 ffmpeg 并加入 `PATH`，或 `FFMPEG_PATH=/path/to/ffmpeg`，
或 `npm i -D @ffmpeg-installer/ffmpeg`（可选依赖，不是必须的）。

**中文路径报错** — 用引号包住路径；`execFile` 传参数组，不会经过 shell 转义。

**源文件比 10 秒短** — ffmpeg 会输出实际长度的音频，淡出滤镜在末尾之后不生效，不会报错。

**改了参数却没重新生成** — 参数已计入指纹；若仍异常，用 `--force` 强制重建。

## 从源码发布到 GitHub

```bash
git init
git add .
git commit -m "feat: initial release of anime-op-ed-clipper"
# 网页新建空仓库后：
git remote add origin https://github.com/ShibinTang/anime-op-ed-clipper.git
git branch -M main
git push -u origin main
```

推送前请确认仓库里没有任何音频文件（`.gitignore` 已排除）。

## License

MIT — 见 `LICENSE`。本仓库不包含任何音乐或图片素材，使用时请自行确保对源音频拥有合法权利。
