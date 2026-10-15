# Cloudflare D1 账号与云备份

Cloudflare R2 继续只存音频；新增的 **D1 数据库**保存云备份账号、登录会话及收藏/做题记录。站点继续部署在 Vercel，通过服务端调用 D1 REST API。无需迁移网站到 Cloudflare，也无需把数据库设为公开。

收藏页或学习记录页点击云朵按钮 → 创建账号/登录 →「备份到云端」或「从云端导入」。账号仅用于手动备份，刷题无需登录。每个账号保留一份最新备份；覆盖已有云备份需确认，恢复合并本地数据，保留已有收藏及已完成成绩。不同设备建议先导入、再备份，避免覆盖另一台设备的新记录。服务器检查备份版本，遇到其他设备的并发更新会拒绝覆盖并提示重试。

## 需要你在 Cloudflare 操作

1. 登录 Cloudflare，进入 **Workers & Pages → D1 SQL Database（D1 SQL 数据库）**，创建数据库，例如 `jlpt-backup`。
2. 记录 **Account ID（账号 ID）**和 **Database ID（数据库 ID）**。这两项不是用户登录网站的账号密码。
3. 进入个人资料 **API Tokens → Create Token → Create Custom Token**，授予当前账号 **Account → D1 → Edit** 权限。按界面可用的资源范围限制到自己的账号/数据库；该 Token 会用于网站持续读写 D1，必须保持有效。
4. 在 D1 数据库的 **Console** 中执行仓库 [migrations/0001-cloud-backup.sql](../migrations/0001-cloud-backup.sql) 的 SQL，创建账号、会话、备份和限流表。可逐条运行；重复执行不会删除数据。

也可在本地 `.env.local` 保存下述变量，然后运行 `npm run setup:cloud` 代替第 4 步。脚本要求 Node.js 22.9+（云环境使用 Node.js 24），使用 HTTPS API，保留证书验证，不输出密钥。

## Vercel 配置

进入对应 Vercel 项目 → Settings → Environment Variables，设置：

| 变量 | 内容 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | 新建 D1 的 Database ID |
| `CLOUDFLARE_D1_API_TOKEN` | 具有 D1 编辑权限的 API Token |

按需选择 Production / Preview / Development，然后重新部署。Preview 建议使用独立测试数据库。**不要添加 `NEXT_PUBLIC_` 前缀，不要把 Token 放进前端代码、GitHub 或聊天。** R2 音频公开 URL 不等于 D1 数据库地址，已有的 R2 上传 Token 通常也没有 D1 权限。

本地开发同样使用这些变量（放在未跟踪的 `.env.local`），执行 `npm run setup:cloud`，再执行 `npm run dev`。`.env*` 已在 `.gitignore` 中。

## 使用与验证

1. 打开 `/history` 或 `/favorites`，点云朵按钮，创建备份账号（3–32 位英文字母、数字或下划线，不区分大小写；密码 8–128 位）。这是用户自己创建的站点账号，不是 Cloudflare 管理员凭据。
2. 本地收藏一些题并作答，点「备份到云端」，成功后显示消息和备份时间（日本时间）。
3. 在另一个浏览器/手机登录相同账号，点「从云端导入」并确认，检查收藏夹、收藏题、学习记录与分数。
4. 重复导入会去重；测试其他账号不能获取这份备份。退出登录不清除本地数据。
5. 多设备同时备份时，后写入的过期版本会被拒绝；重新打开云备份弹窗读取最新状态，先导入合并再备份。

未配置时显示「云备份尚未配置」；网络错误、登录错误、格式错误和备份失败均会显示可关闭的消息，不报告成功。只有 D1 确认写入或本地合并完成后才提示成功。消息支持中文、日语、英文。

## 数据与限制

- 密码通过带随机盐的 scrypt 哈希保存；会话以随机令牌的 SHA-256 摘要保存，Cookie 使用 HttpOnly、SameSite=Lax、HTTPS 下 Secure，有效期 30 天。退出立即撤销当前会话。
- 写入检查同源 Origin，SQL 使用参数绑定；按账号和请求 IP 在数据库持久限流。登录/注册每个 IP 每 15 分钟 30 次，每个账号每 15 分钟 15 次，注册每 IP 每小时 5 次；窗口结束后恢复。备份写入每账号每分钟 20 次。Vercel 的转发 IP 用于 IP 限流。
- API Token 仅供服务端使用。管理员有数据库管理权限；当前备份不是客户端端到端加密。
- 每账号一份最新快照，JSON 上限 **1 MiB**（D1 每行限制 2 MB，预留空间）。超过限制请用原有文件导出保存全部记录；文件导出上限不受该云端限制影响。
- 云备份只含收藏与学习记录，不上传音频、题库正文或主题/语言偏好。原有文件导入导出仍可使用。
- 此版没有密码找回、改密码或账号删除页面，请妥善保管密码。不要使用 Cloudflare 管理密码作为站点备份密码。
- 数据库费用、配额和可用性取决于自己的 Cloudflare 套餐；实际 D1 连通及跨设备流程需在配置完成后验证。

## 开发检查

```bash
npm run test:cloud
node --test scripts/test-learning-backup.mjs scripts/test-favorites-store.mjs scripts/test-study-store.mjs
npm run lint
npm run build
```

云接口测试使用本地 SQLite 执行同一份迁移及 SQL，模拟 D1 REST 响应，覆盖账号隔离、密码验证、过期/退出会话、限流、格式/大小检查和备份版本冲突；这些测试不代表已经连通真实 Cloudflare D1。
