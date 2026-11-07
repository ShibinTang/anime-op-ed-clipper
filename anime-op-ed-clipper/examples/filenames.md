# 文件名解析对照表

以下都是 `parseName()` 的实际行为，可用 `node scripts/selftest.mjs` 复核。

| 源文件名 | anime | song | kind |
| --- | --- | --- | --- |
| `刀剑神域 - courage.flac` | 刀剑神域 | courage | OP |
| `进击的巨人 - 美しき残酷な世界 [ED].flac` | 进击的巨人 | 美しき残酷な世界 | ED |
| `鬼灭之刃 - 紅蓮華（片尾）.m4a` | 鬼灭之刃 | 紅蓮華 | ED |
| `某作品 - 主题曲 [OP1].mp3` | 某作品 | 主题曲 | OP |
| `鬼灭之刃_紅蓮華.m4a` | 鬼灭之刃 | 紅蓮華 | OP |
| `Re:Zero - Redo - ver.mp3` | Re:Zero | Redo - ver | OP |
| `孤独摇滚.mp3` | 孤独摇滚 | (空) | OP |
| `courage.flac` | courage | (空) | OP |

支持的扩展名：`.flac .mp3 .m4a .wav .ogg .aac .opus .wma`（大小写不敏感）。

## 输出名示例

| 源文件名 | 输出名 |
| --- | --- |
| `刀剑神域 - courage.flac` | `courage-<8位hash>.mp3` |
| `Sword Art Online - 青春コンプレックス.flac` | `sword-art-online-<8位hash>.mp3` |
| `孤独摇滚 - 青春コンプレックス.mp3` | `track-<8位hash>.mp3` |

具体 hash 由源文件名的 SHA-1 决定，可用 `slugFor()` 复算。
本目录不存放任何音频文件，示例仅用于说明命名规则。
