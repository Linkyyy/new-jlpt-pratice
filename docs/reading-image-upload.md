# 阅读缺图上传清单

本批原有 17 道缺图小题，涉及 11 张图片。2026-10-23 根据站点所有者确认已全部上传，现已关联并开放作答。图片存放在听力的同一个 Cloudflare R2 Bucket，`pic/` 和 `audio/` 位于根目录、互相平级。

图片统一保存为 JPG。PNG 图片请先导出或转换为 JPG，再使用下表中的文件名。

| 等级 | 场次 | 卷面题号 | 用途 | R2 对象路径 |
| --- | --- | --- | --- | --- |
| N1 | 2025年7月 | 65、66 | 共用文章图 | `pic/120250765.jpg` |
| N1 | 2025年7月 | 65 | 小题附图 | `pic/120250765-1.jpg` |
| N1 | 2025年12月 | 65、66 | 共用文章图 | `pic/120251265.jpg` |
| N1 | 2026年7月 | 65、66 | 共用文章图 | `pic/120260765.jpg` |
| N2 | 2025年7月 | 70、71 | 共用文章图 | `pic/220250770.jpg` |
| N2 | 2025年12月 | 70、71 | 共用文章图 | `pic/220251270.jpg` |
| N2 | 2026年7月 | 70、71 | 共用文章图 | `pic/220260770.jpg` |
| N2 | 2026年7月 | 70 | 小题附图 | `pic/220260770-1.jpg` |
| N3 | 2024年12月 | 37、38 | 共用文章图 | `pic/320241237.jpg` |
| N3 | 2025年12月 | 24 | 通知图 | `pic/320251224.jpg` |
| N3 | 2025年12月 | 37、38 | 共用文章图 | `pic/320251237.jpg` |

新版图片按 `等级数字＋年月＋该组第一题的卷面原题号.jpg` 命名，小题附图加 `-1` 等后缀。N3 第24题使用24，第37、38题共用图使用37，与页面原题号一致。此前使用累计编号59、72的三个新图片名已替换，请以上表为准；其他旧题库的既有图片名不变。

例如，N1 2025年7月的共用文章图，其对象路径是 `pic/120250765.jpg`；公开 URL 为当前图片／音频基础域名后拼接这个路径。

原始 UUID 文件名和新路径的逐项对应关系见 [JSON 清单](exam-bank-missing-images-2026-10-22.json)。此清单由以下命令生成：

```sh
npm run import:exam-bank -- --source <整卷JSON目录> --image-report docs/exam-bank-missing-images-2026-10-22.json
```

本次开放最初依据所有者的上传确认。2026-10-23 网络权限生效后，已实际下载并完整解码这 11 张图片，逐图核对并将文字纳入词频统计。下载状态、尺寸和 SHA-256 记录在 `src/data/imported-bank/verified-reading-images.json`；上传确认仍保留。后续可按以下流程重新验证。

## 上传后校验与开放

先下载清单中的全部图片并完整解码，检查 HTTP 状态、图片格式、尺寸和文件完整性。脚本保留每张图片的 SHA-256，失败时不会生成可用于开放题目的校验凭据：

```sh
npm run verify:reading-images -- --download-dir /tmp/jlpt-reading-images
```

默认读取上方 JSON 清单，使用网站统一图片／音频基础域名，结果保存到 `/tmp/jlpt-reading-image-verification.json`。也可使用 `--base-url https://你的公开资源域名`、`--checklist 清单路径` 和 `--output 报告路径`。Node.js 需要支持 `--use-env-proxy`（本项目云环境为 Node.js 24），以沿用环境代理和证书配置。

检查下载图片与相应题干的内容一致后，才执行开放命令：

```sh
npm run import:exam-bank -- --source <整卷JSON目录> \
  --verified-images /tmp/jlpt-reading-image-verification.json \
  --report docs/exam-bank-import-2026-10-22.json \
  --image-report docs/exam-bank-missing-images-2026-10-22.json
npm run check:bank
npm run build
```

开放时会保留原题 ID、题序、答案及来源，共用文章图与小题附图分别关联。校验报告保存在 `src/data/imported-bank/verified-reading-images.json`，以后重新导入自动沿用；无需每次重复传 `--verified-images`。听力的可作答状态不受影响。

环境代理拒绝访问、图片 404、返回网页而不是图片、文件损坏等都不能视为校验通过。

当所有者已确认上传并明确要求开放时，也支持显式登记上传清单，无需伪造校验通过报告：

```sh
npm run import:exam-bank -- --source <整卷JSON目录> \
  --uploaded-images docs/exam-bank-missing-images-2026-10-22.json \
  --report docs/exam-bank-import-2026-10-22.json
```

该方式只开放清单中安全的 `pic/` 路径，后续重新导入会自动沿用上传确认；其他缺失资源仍保持关闭。
