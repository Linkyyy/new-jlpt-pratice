# 自动下载音频与图片

要求 Node.js 20.18.1 或更新版本（推荐 Node.js 24）。在本目录执行：

```bash
npm ci
node download-media.mjs media-list.json --output ./downloads
```

程序读取之前生成的 JSON 数组，按 `folder/name` 下载。音频原样保存；图片通过 sharp 解码、按 EXIF 方向旋转、透明区域填白，再编码为真正的 JPG。图片的 name 扩展名统一替换为 `.jpg`，没有扩展名则追加 `.jpg`，例如 `320251262.png` 保存为 `pic/320251262.jpg`。

输出示例：

```text
downloads/
  202512n3/
    1.mp3
    12.mp3
    full.mp3
  pic/
    320251262.jpg
  failed-downloads.json
```

可以只下载音频或图片：

```bash
node download-media.mjs audio-list.json --output ./downloads
node download-media.mjs image-list.json --output ./downloads --quality 90
```

默认并发 4、单次请求与转换超时 120 秒、失败最多重试 2 次。HTTP 404 等确定性客户端错误不重试，429 和服务器错误会重试。再次运行会跳过已有非空文件；零字节文件会重新下载。图片既检查 `.jpg` 扩展名，也验证已有文件的实际格式。临时文件下载和转换全部成功后才会替换或发布最终文件，失败不会把半成品留作成功文件。

```bash
node download-media.mjs media-list.json --output ./downloads --concurrency 6 --retries 3 --timeout 180
node download-media.mjs media-list.json --output ./downloads --overwrite
node download-media.mjs downloads/failed-downloads.json --output ./downloads
node download-media.mjs --help
```

`failed-downloads.json` 每次运行都会更新，只包含本轮失败的原始条目及错误信息，可直接作为重试输入。有任何失败时程序返回退出码 1。目标重名（包括 PNG/WebP 转 JPG 后重名）、非法目录和路径穿越会在发起下载之前报错。

支持标准 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 及小写变量，保留 TLS 证书校验。在此云环境实际下载需要在环境设置中允许访问 `oss.mojidict.com`；本程序测试使用本地 HTTP 样例，未执行 261 个真实资源的批量下载。

本地回归验证：

```bash
npm test
```

测试覆盖真实 HTTP 下载、中文 URL、PNG 到 JPEG 内容转换、透明底色、音频字节保真、失败重试、断点续下、覆盖、失败清单、空响应和临时文件清理。
