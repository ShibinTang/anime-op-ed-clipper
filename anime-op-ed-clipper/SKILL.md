---
name: anime-op-ed-clipper
description: 'Use when turning local anime OP/ED audio into short MP3 intro clips for a guessing game. Trims, fades, writes manifest.json. Triggers: 切前奏, OP/ED 切片, 音频切片, trim intro.'
license: MIT
metadata:
  displayName: 'Anime OP/ED Clipper'
  category: media
  tags: 'ffmpeg, audio, anime, cli, agent-skills'
compatibility:
  - claude
  - copilot
  - cursor
  - codex
allowed-tools:
  - Bash
  - Read
  - Write
---

# Anime OP/ED Clipper

## Overview

Turn a folder of local anime opening/ending songs into short, small MP3 intro
clips, plus a `manifest.json` that describes every clip. This is an offline
processing tool only: it never downloads audio and never writes to a database.

Core logic lives in `scripts/lib/` (pure functions, no npm dependencies) and is
exposed through `scripts/clip.mjs`.

## When to use

- The user has local audio files and wants 10-second intro clips for a
  "guess the song / guess the anime" game.
- The user wants a repeatable, idempotent batch conversion with predictable
  filenames and metadata.
- The user asks to build or extend an audio-clipping pipeline.

## When NOT to use

- The user wants to download songs or videos. This skill has no downloader;
  ask for locally available, legally obtained files instead.
- The user wants the clips inserted into a specific database. Produce
  `manifest.json` and let the caller import it (an example is in
  `references/naming-convention.md`).
- The user wants full-length audio, lyrics, or cover art extraction.

## Prerequisites

- Node.js 18 or newer.
- `ffmpeg` on `PATH`, or `--ffmpeg <path>`, or `FFMPEG_PATH` env var, or the
  optional `@ffmpeg-installer/ffmpeg` npm package.
- No `npm install` is required.

## Naming convention

Name each source file `Anime - Song.ext`. Mark endings with `[ED]`:

| Source file | anime | song | kind |
| --- | --- | --- | --- |
| `刀剑神域 - courage.flac` | 刀剑神域 | courage | OP |
| `进击的巨人 - 美しき残酷な世界 [ED].flac` | 进击的巨人 | 美しき残酷な世界 | ED |
| `孤独摇滚.mp3` | 孤独摇滚 | (empty) | OP |

Supported input extensions: `.flac .mp3 .m4a .wav .ogg .aac .opus .wma`.
`[OP]`, `[ED]`, `（片尾）`, `(ending)` markers are stripped before parsing.
Only a hyphen surrounded by spaces (or `_`) splits the name, so hyphens inside
song titles survive. See `examples/filenames.md` for more cases.

## Standard workflow

1. Confirm the input directory and output directory with the user. Never copy
   source audio into the skill directory.
2. Preview first, so the user can check parsed names before any work:

   ```bash
   node scripts/clip.mjs --in "<input-dir>" --out "<output-dir>" --dry-run
   ```

3. Run the real conversion:

   ```bash
   node scripts/clip.mjs --in "<input-dir>" --out "<output-dir>" --concurrency 4
   ```

4. Report the summary (created / skipped / failed) and the path to
   `manifest.json`. If anything failed, show the error lines and do not claim
   success.

Useful variants:

```bash
# 15-second clips at 96 kbps, no URL prefix in the manifest
node scripts/clip.mjs --in ./input --out ./out --seconds 15 --bitrate 96k --prefix=

# force regeneration, ignoring the incremental cache
node scripts/clip.mjs --in ./input --out ./out --force

# verify the pure functions without ffmpeg
node scripts/selftest.mjs
```

## Options

`--seconds` (default 10), `--fade-in` (0.2), `--fade-out` (0.5),
`--bitrate` (128k), `--concurrency` (4), `--prefix` (`/audio/op-ed`),
`--manifest`, `--ffmpeg`, `--force`, `--dry-run`, `--help`.

## Output

One `<slug>.mp3` per source file plus `<out>/manifest.json`. The slug is an
ASCII label plus an 8-character hash of the source filename, so two songs with
the same title never overwrite each other. Each manifest entry contains
`source`, `output`, `audioUrl`, `anime`, `song`, `kind`, `slug`,
`fingerprint`, `bytes`, `status`, `updatedAt`. No absolute local paths are
stored. See `examples/manifest.sample.json`.

Re-running is cheap: a fingerprint of filename + size + mtime + render options
is compared against the manifest, unchanged files are skipped. Changing
`--seconds` or `--bitrate` invalidates the fingerprint automatically.

## Hard boundaries

- Do not bundle, commit, or redistribute source audio or generated clips.
  The repository's `.gitignore` excludes all audio formats.
- Do not add a downloader to this skill.
- Do not write directly into a web app's `public/` directory unless the user
  explicitly asks; use a separate output directory.

## Troubleshooting

`references/ffmpeg-notes.md` explains why `-t` must precede `-i`, how the fade
filter behaves on short files, Windows path quirks, and the ffmpeg lookup
order. `references/naming-convention.md` covers naming edge cases and how to
import the manifest into your own quiz table.
