# 听力音频与 Cloudflare R2

网站继续使用 `PracticeQuestion.media.audio`，不增加或重排原题字段。现有来源 JSON 的 `row.audio` 优先，缺失时继承父题 `audio`，多道子题可以引用同一录音。**不根据题号、`id` 或数组位置推算文件名。**

对象键示例：`audio/202412n1/1.mp3`、`audio/202407n2/1.mp3`。相对路径经 `src/lib/audio-url.mjs` 的 `getAudioUrl()` 与公开域名拼接；已有 HTTPS 完整音频地址继续直连，旧 `/imported-media/audio/...` 引用在配置域名后也会映射至 R2。更换存储商时只需修改公开域名并重新构建。

## 当前网站试听

网站默认公开音频域名已设置为 `https://pub-8ac2a059bee9443c839a7e7f2f350e93.r2.dev`。首页“听力播放测试”进入 `/audio-test`，分别加载 `audio/202412n2/1.mp3` 和 `audio/202412n2/2.mp3`。这是合成英语语音试听，不进入正式题库、答题记录或评分。

此测试入口无需另外配置 Vercel 环境变量即可使用默认域名。若已有 `NEXT_PUBLIC_AUDIO_BASE_URL`，该变量优先于默认域名；需要指向本次 Bucket，或删除旧值后重新部署。正式切换自定义域名时仍建议通过这个变量覆盖。公开域名不是上传凭据。

## 1. 在 Cloudflare 中操作

1. 启用 R2，创建一个 Bucket，例如 `jlpt-audio`；约 500 MB 无需特殊分片或应用服务器存储。
2. 在 Bucket 的 Settings → Public access 中添加 Custom Domain，例如 `audio.example.com`（域名需在该 Cloudflare 账户管理）。等待域名生效。调试时可启用 Public Development URL `https://pub-….r2.dev`，正式上线建议使用自定义域名。
3. 在 R2 的 API Tokens 页面创建 R2 API Token，选择 **Object Read & Write**，仅授权这个 Bucket。保存返回的 Access Key ID 和 Secret Access Key；另外记录 Account ID 和 Bucket 名称。上传使用 S3 凭据，不使用全局 Cloudflare API Key，也不把 Cloudflare Bearer Token 当作 Secret Access Key。
4. 如设置 CORS，可在 Bucket 配置如下规则，将域名替换为实际网站域名。本播放器使用普通 `<audio>` 直连，不设置 `crossOrigin`；CORS 规则也便于后续跨域检查。CORS 不等于私有访问控制，公开对象仍可由公开 URL 读取。

```json
[
  {
    "AllowedOrigins": ["https://new-jlpt-practice.vercel.app", "https://你的正式域名"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

预览部署若需 CORS，请加入对应预览域名。不要使用需要登录验证、Cloudflare Access 挑战或下载跳转的音频地址。

## 2. 批量上传 MP3

本地资源目录必须包含 `audio/`，脚本保留其下原始目录和文件名：

```text
/你的资源目录/
  audio/
    202412n1/1.mp3
    202412n1/2.mp3
    202407n2/1.mp3
```

在仓库根目录使用 Node.js 20.12+（建议 Node.js 22 LTS）：

```bash
npm ci
# 不连接 R2、不上传、不生成已上传清单
npm run upload:audio -- --directory "/你的资源目录" --dry-run
```

在本地创建 `.env.r2.local`，该文件已被 Git 和 Vercel 忽略：

```dotenv
R2_ACCOUNT_ID=你的32位AccountID
R2_ACCESS_KEY_ID=你的AccessKeyID
R2_SECRET_ACCESS_KEY=你的SecretAccessKey
R2_BUCKET_NAME=jlpt-audio
```

执行实际上传：

```bash
node --env-file=.env.r2.local scripts/upload-r2-audio.mjs \
  --directory "/你的资源目录" --manifest "/你的资源目录/r2-audio-manifest.json"
```

脚本只上传非空 MP3，不跟随符号链接；最多同时上传 4 个文件，使用流式传输，失败时重开流重试。设置 `Content-Type: audio/mpeg` 和一天的公开缓存。**同名对象会被覆盖**；替换音频后若使用自定义域名缓存，请清理对应 Cloudflare 缓存或等待过期。

所有上传成功后才生成 `{ "version": 1, "keys": ["audio/…/1.mp3"] }` 清单。清单不含密钥；请勿手工加入尚未上传的键。失败后可以重跑上传，同一对象键保持不变。

## 3. 启用题库中的听力题

当前仓库保留了原始音频引用，但因缺失媒体，听力题仍在 `unavailable` 中。仅配置域名不会自动把缺失资源标记为可作答。

上传完成后，用原始 JSON 全量资源目录重新导入，并保留已有图片资源：

```bash
npm run import:bank -- --source "/原始题库JSON目录" \
  --media "/原有图片资源根目录" \
  --audio-manifest "/你的资源目录/r2-audio-manifest.json"
npm run check:bank
```

`--source` 应包含原有全量 JSON；导入器重建索引，不要只传一个听力文件而丢失其他题型。`--media` 仍处理图片，**不再复制音频至 public/**。只有音频引用在上传清单中且其他题目数据、图片有效时，题目才进入可作答列表。清单不会检查公网可访问性，下一步需实际验证 R2。完整 HTTPS 音频字段兼容已有数据，由题库维护者保证可访问。

重新导入后提交 `src/data/imported-bank/` 的题目及索引变更。首页选择“听力”即可练习或考试；“整套文字练习”继续只包含文字题型。播放器亦用于已有的收藏练习和复习页面，无需修改它们的数据。

## 4. 配置 Vercel 并部署

1. 在 Vercel → Project → Settings → Environment Variables 添加 **`NEXT_PUBLIC_AUDIO_BASE_URL=https://audio.example.com`**，分别勾选需要的 Production / Preview / Development 环境。只填域名或公共前缀，不附加 `/audio`，除非 Bucket 键本身还位于另一层前缀下。
2. 上传密钥仅在执行上传的本机/受信任 CI 使用，**不需要配置到 Vercel，更不能使用 `NEXT_PUBLIC_` 前缀**。
3. 本地验证可在 `.env.local` 中设置同一公开变量，然后运行 `npm run lint`、`npm run test:audio`、`npm run check:bank`、`npm run build`、`npm start`。
4. 推送代码和已更新的题库到 GitHub 生产分支，触发 Vercel 部署，或在 Vercel 手动 Redeploy。公开变量在构建时内联，改域名后必须重新部署。

MP3 不经过应用 API 或 Vercel 后端中转，不使用签名 URL，也不读取 R2 私钥。`.gitignore`、`.vercelignore` 排除音频；`prebuild` 会拒绝 `public/` 中的音频，避免误部署。既有本地音频引用仅供迁移前本地兼容，部署时应配置 R2 域名。

## 5. 上线验证与排查

先验证一个实际对象（将示例域名替换为自己的）：

```bash
curl -I https://audio.example.com/audio/202412n1/1.mp3
curl -sS -D - -o /dev/null -H 'Range: bytes=0-1023' \
  https://audio.example.com/audio/202412n1/1.mp3
```

应为 `200`/`206`、`Content-Type: audio/mpeg`，范围请求应支持 `206` 和 `Content-Range`，便于拖动进度。若返回 `403`/`404`/HTML，检查公开访问、对象键大小写和域名状态。

在电脑和手机打开同一听力卷：

- 打开页面及切题时，网络面板不应请求整份听力卷的 MP3；点击播放才加载当前音频，浏览器可能为当前录音缓冲或请求字节范围。
- 验证播放、暂停、拖动进度及 `0.75x / 1x / 1.25x / 1.5x`，切到下一题时上一录音应停止；即使两题引用同一文件也会停止。
- 音量滑块在支持程序音量的浏览器生效；iOS Safari 等由系统控制媒体音量的平台，请使用设备音量键。这是平台限制。
- 断网或临时使用错误对象地址，应出现中文错误和“重试音频”；恢复网络或修复对象后点击重试。

自动测试使用临时 MP3、临时题库和浏览器网络拦截，不向仓库或部署产物添加录音。浏览器仿真不能替代真实 iPhone / Android 的最后验收。
