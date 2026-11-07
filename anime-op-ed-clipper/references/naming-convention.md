# 命名约定、manifest 与入库对接

## 源文件命名

```
动漫名 - 歌曲名.扩展名
动漫名 - 歌曲名 [ED].扩展名     # 片尾曲
```

- 分隔符是「两侧带空格的横线」（`-` `–` `—` `－`）或下划线 `_`。
  歌名里不带空格的连字符（如 `Redo-ver`）不会被误切。
- 只按**第一个**分隔符切分：`Re:Zero - Redo - ver.mp3` → 作品 `Re:Zero`，歌名 `Redo - ver`。
- 可识别并剥离的标记：`[OP]`、`[ED]`、`[OP1]`、`(ending)`、`（片尾）`、`[片头曲]` 等。
  只认带括号的标记，避免把歌名里普通的 `ed` 当成片尾。
- 没有分隔符时，整个文件名作为作品名，`song` 为空。
- 更多边界用例见 `examples/filenames.md`。

## 输出文件名

`slugFor(sourceRef, anime, song)` = ASCII 化的歌名（歌名没有 ASCII 时退回作品名）
+ `-` + 源文件名的 SHA-1 前 8 位，例如 `courage-a1b2c3d4.mp3`。
纯中文/日文名会退化成 `track-e5f6a7b8.mp3`，仍然唯一、稳定、URL 安全。

哈希只依赖源文件名，不依赖路径或时间，所以换机器、重跑、改参数都不会改文件名。

## manifest.json 字段

| 字段 | 含义 |
| --- | --- |
| `source` | 源文件名（不含路径） |
| `output` | 输出 MP3 文件名 |
| `audioUrl` | `--prefix` + `/` + `output`，给前端播放用 |
| `anime` / `song` / `kind` | 解析出的元数据，kind 为 `OP` 或 `ED` |
| `slug` | 不含 `.mp3` 的输出名 |
| `fingerprint` | 增量判断用的 16 位指纹 |
| `bytes` | 输出文件大小 |
| `status` | `created` / `skipped` / `planned` / `would-skip` |
| `updatedAt` | ISO 时间戳 |

刻意不存绝对路径、不存数据库 id，manifest 可以随产物一起分发。

## 入库示例（MySQL）

按 `audio_url` 做幂等 upsert，重复运行不会产生重复题目：

```sql
INSERT INTO guess_questions
  (category_id, prompt, answer, aliases, audio_url, explanation)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  answer = VALUES(answer), explanation = VALUES(explanation);
```

建议映射：

- `answer` ← `anime`（猜的是作品名）
- `aliases` ← JSON 数组 `[song, anime]` 去重，允许玩家答歌名
- `audio_url` ← `audioUrl`
- `prompt` ← 依据 `kind` 生成「听这段 10 秒前奏，猜这是哪部动漫的 OP？」
- `explanation` ← `《anime》的 OP《song》`

如果只想要相对文件名，运行加 `--prefix=`，`audioUrl` 就等于 `output`。

## 从「直接写库」的旧流水线迁移

原实现把切片、文件名解析、SQL upsert 揉在同一个模块里，导致这个能力无法被
别的项目复用。本仓库把数据库部分完全剥离：先产出 manifest，再由你自己的
导入脚本消费。这样切片器可以独立测试、独立开源，也不会把表结构强加给使用者。

## 版权边界（重要）

- 本仓库不附带任何音乐、音频片段或图片，`.gitignore` 显式排除所有音频格式。
- 不提供下载器。请只对**你合法持有**的音频文件做处理。
- 切片是原录音的衍生内容，公开分发前请自行确认授权；本工具的 MIT 许可
  只覆盖代码，不覆盖任何音频内容。
- 猜题场景下建议控制片段长度、只用于非商业的个人/教学用途，并在页面标注来源。
