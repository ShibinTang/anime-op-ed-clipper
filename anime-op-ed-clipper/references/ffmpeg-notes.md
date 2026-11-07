# ffmpeg 参数与踩坑记录

这些是流水线里每个参数存在的原因，改代码前先读。

## 1. `-t` 必须放在 `-i` 之前

```
ffmpeg -t 10 -i huge.flac ...   # 输入选项：只解码前 10 秒
ffmpeg -i huge.flac -t 10 ...   # 输出选项：仍会先解码整个文件
```

几百 MB 的无损 FLAC 用第一种是秒出，第二种会明显变慢。`buildFfmpegArgs()`
把 `-t` 排在 `-i` 前，自测里有一条断言专门守着这个顺序。

## 2. `-map_metadata -1` 是玩法需求，不只是洁癖

源文件常带 ID3 / Vorbis 标签，里面有歌名、专辑名甚至封面。猜题游戏如果
把原始元数据带进片段，玩家打开文件属性就能看到答案。这一行会把元数据全部丢掉。
`-vn` 同理，去掉内嵌封面图与视频流。

## 3. 淡入淡出的起点计算

```
afade=t=in:st=0:d=0.2
afade=t=out:st=(seconds - fadeOut):d=fadeOut
```

- 淡出起点用 `Math.max(0, seconds - fadeOut)`，避免自定义参数导致负数。
- 源音频短于 `seconds` 时，ffmpeg 输出实际长度，末尾的淡出不生效，不会报错。
- 淡入淡出是为了让片段起止不「咔」一声，别用 `-ss` 硬切开头。

## 4. 统一编码参数

| 参数 | 原因 |
| --- | --- |
| `-c:a libmp3lame -b:a 128k` | 浏览器兼容最好，10 秒约 150 KB |
| `-ac 2` | 少数源是 5.1，统一成双声道避免播放器行为不一致 |
| `-y` | 允许覆盖已有输出，配合增量逻辑重生成 |
| `-v error` | 只保留错误，日志不被进度刷屏 |
| `-hide_banner` | 去掉编译信息 |

## 5. ffmpeg 查找顺序

`--ffmpeg` → `FFMPEG_PATH` 环境变量 → 可选的 `@ffmpeg-installer/ffmpeg` → `PATH` 上的 `ffmpeg`。
可选包用 `createRequire` 动态加载并包在 `try/catch` 里，所以仓库可以做到零 npm 依赖：
clone 下来直接 `node scripts/clip.mjs` 就能跑（只要系统有 ffmpeg）。
执行前会先跑一次 `ffmpeg -version` 探测，失败时给出可读的提示，而不是抛一堆 stderr。

## 6. Windows 路径

- 用 `execFile(ffmpeg, argsArray)` 传参数组，不拼 shell 字符串，中文、空格、日文歌名都不会被转义破坏。
- 路径统一通过 `resolve()` 变绝对路径再传给 ffmpeg。
- 若要隐藏控制台窗口，可在 `execFile` 的 options 里加 `windowsHide: true`。

## 7. 增量策略为什么用 manifest 指纹

原实现靠「输出文件 mtime ≥ 源文件 mtime」判断是否最新，这在数据库记录丢失、
输出文件被复制到别处、参数改过时都会失准。这里改成把
`文件名 | 大小 | mtime | 渲染参数` 做 SHA-1 写进 `manifest.json`：

- 不读文件内容，扫描大目录依然很快；
- `--seconds` / `--bitrate` 等参数变化会自动让旧指纹失效；
- manifest 不含绝对路径，可以连同 mp3 一起搬到别的机器接着用。

`--force` 用于绕过缓存全部重建。

## 8. 并发

ffmpeg 是 CPU 密集型，默认 4 路并发；机械硬盘或低配机器建议降到 2。
单个文件失败只记入 `failures` 并继续处理其余文件，最后统一汇总并让 CLI 返回非零退出码。
