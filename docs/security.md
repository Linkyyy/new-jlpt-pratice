# 网站安全防护与上线设置

## 已随代码启用

- 统计查询、PDF／Excel 导出、词条纠错现在与统计页面共用暗号校验；无访问凭据返回 401，不能绕过页面直接下载。正常刷题依然公开。路由自身再次校验，统计响应改为 `private, no-store`，防止共享 CDN 缓存绕过访问校验。
- API 总突发限制每 IP 每实例 40 次／10 秒、240 次／分钟；页面请求 60 次／10 秒、180 次／分钟。Next 静态文件、图片优化和 robots 不进入这一层。原有每个接口的更细限制保留。
- 统计查询增加 1,200 次／小时、导出增加 20 次／小时的限制；导出仍最多每实例同时处理 1 个。暗号校验增加 100 次／小时限制。
- 超额返回 429 和 `Retry-After`，不缓存错误；不为这些新增计数访问 D1。请求 URL 最长 8,192 字符，已声明的 API 请求体最多 1 MiB；具体接口仍校验实际流式请求体的更小上限。
- 拒绝明显跨站 API 调用、不支持的方法，以及 `.env`、`.git`、WordPress 等常见探测路径；正常收藏、复习、备份、音频 Range 请求不改变。
- 安全响应头限制 iframe 嵌入、MIME 嗅探、插件和 base 标签劫持，关闭用不到的相机、麦克风、定位权限，移除框架标识。CSP 是兼容现有功能的基础策略，不声称已经覆盖所有 XSS。
- `robots.txt` 与统计／API 的 `X-Robots-Tag` 请求合规爬虫不收录受保护内容。恶意客户端可以忽略 robots、伪造浏览器头，仍需限流与平台 Bot 防护。

这些代码限制只属于当前运行实例；冷启动、多区域、多个实例不共用计数。恶意请求仍可能产生 Vercel 的调用和流量费用，**不能作为全站 DDoS 防护或费用硬上限**。IP 限制可能被同一网络的多人共用；必要时根据 Firewall 观察记录调整代码阈值。

## 1. Vercel：现在就能配置，无需自己的域名

进入项目 **Settings → Environment Variables**，增加仅服务端使用的：

```dotenv
ACCESS_TOKEN_SECRET=<随机生成的至少 32 字符密钥>
# 可选：遭遇集中恶意导出时，临时关闭导出，浏览与刷题继续可用。
# FREQUENCY_EXPORT_ENABLED=false
```

在自己电脑执行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成密钥，填入 Production（Preview 如需也单独配置），然后重新部署。密钥不要以 `NEXT_PUBLIC_` 开头，不要发送到聊天、提交 GitHub 或放进前端。所有实例必须使用相同值；配置／轮换后，旧浏览器需重新输入一次暗号。

未配置该变量时，为兼容已有访问记录，仍沿用原来的浏览器凭据。原算法可由公开代码推导，**不要将未配置密钥的暗号页视为可靠的内容访问保护**。暗号本身仍是既有共享暗号；知道暗号的人也能访问数据，无法阻止其手工复制。需要更强防自动化时，在下述平台启用 Bot 规则，或另行接入 Turnstile 人机验证／独立账号授权。

进入项目 **Firewall**（入口名称以实际控制台为准）：

1. 确认平台 DDoS 防护正常，查看 Security／Firewall 的请求与拦截记录。
2. 若当前套餐提供 Bot 管理或托管挑战，先观察再开启。优先保护 `/frequency`、`/access` 和可疑页面访问。不要对 JSON API 直接返回 HTML 挑战页，否则查询、备份和导出会失败；API 用限速或 Block。
3. 若提供 Rate Limiting，为 `/api/frequency/export` 设置每 IP 6 次／分钟，为 `/api/activation` 设置 20 次／分钟，为其他 `/api/*` 设置 240 次／分钟作为起点。观察多人共用 IP 的误拦，再调整；实际可用功能和计费以你的套餐为准。
4. 对明显恶意来源建立临时 IP 拦截，并设置到期时间。不要直接封禁所有爬虫 User-Agent 或所有海外地区。
5. 开启 Usage／Spend 相关通知及当前套餐支持的消费控制，特别关注 Edge Requests、Function 调用／CPU、Data Transfer。告警本身不是硬停机开关。

以上控制台设置无法由本仓库提交自动代你开启，也没有在代码中假装已经开启。

## 2. Cloudflare R2：目前 `r2.dev` 需要单独处理

MP3／JPG 直连公开 R2，不经过网站 Proxy；代码不能限制这些 URL 的访问。你不能把 Cloudflare DNS／WAF 规则直接加在不属于你的 `vercel.app`、`r2.dev` 域名上。

可选路线：

1. 使用自己的域名接入 Cloudflare，并为 Bucket 绑定例如 `media.example.com` 的自定义域名。
2. 将 Vercel 的 `NEXT_PUBLIC_AUDIO_BASE_URL` 改为新资源根地址，重新部署，确认旧目录结构、图片、MP3 播放、拖动进度与 Range 请求均正常。
3. 在资源域名可用的 WAF／Rate Limiting 设置中配置防刷，并启用适当缓存。按实际一个人切题时的请求数观察阈值；不要对音频、图片返回交互挑战页，不要阻止 GET、HEAD、Range。
4. 验证后关闭 Bucket 的公开 `r2.dev` 入口，否则攻击者仍能绕过自定义域名防护。资源缓存可以减少 R2 读取，但不能保证客户端下行或平台总费用的硬上限。
5. 若必须在没有自定义域名时禁止公开桶直读，需要改用私有 R2 + Worker 读取绑定 + 短时签名 + 共享限流。这是另一套资源授权部署，当前仍保留你要求的 R2 直接播放方式，未擅自改变存储架构。

不要把 CORS、Referer 检查、隐藏播放地址或禁用右键当成访问授权。

## 验证

运行 `node --test scripts/test-security.mjs scripts/test-request-limits.mjs scripts/test-activation.mjs scripts/test-visit-access.mjs`，再运行 `npm run build`。

本地安全测试使用隔离的模拟请求与时钟；不要对线上网站做压力测试。外部平台规则需在控制台部署后检查拦截日志，再用少量正常操作验证。
