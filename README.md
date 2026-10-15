# JLPT Practice

日语能力考试练习应用，使用 Next.js 16.4、React 19 和 TypeScript。支持分级练习、模拟考试和本地收藏。

## 本地运行

```bash
npm ci
npm run dev
```

打开 http://localhost:3000。收藏保存在当前浏览器的 localStorage 中。

## 检查与构建

```bash
npm run lint
npm run check:bank
npm run build
npm start
```

## GitHub + Vercel 部署

将仓库推送至 GitHub，然后在 Vercel 导入该仓库：

- Framework Preset：Next.js
- Root Directory：项目根目录（`.`）
- Install Command：`npm ci`
- Build Command：`npm run build`
- Output Directory：保留 Next.js 默认值
- Environment Variables：已配置默认 R2 公开音频域名，首页按题型选择“听力”；更换域名可用 `NEXT_PUBLIC_AUDIO_BASE_URL` 覆盖

应用包含服务端题库读取和 API，使用 Vercel 的 Next.js 部署方式。`next.config.ts` 已配置题库 JSON 文件追踪，生产部署包含练习和收藏接口需要的数据。

关联 GitHub 后，推送至生产分支触发生产部署，其他分支或 PR 生成预览部署。不要提交 `.env*`、`.vercel`、`node_modules` 或 `.next`。

题库格式与导入说明见 [src/data/README.md](src/data/README.md)。

## MP3 听力播放

播放器以单行显示播放/暂停图标、进度、时长和 0.75–1.5 倍速，切题时自动暂停，加载失败可重试。音频按当前题目按需直连 Cloudflare R2，不经过 Vercel。

首页选择场次和“听力”即可开始练习或考试。题目继续使用已有音频路径，不预先检查所有远端文件；某题播放时文件缺失或加载失败，再显示错误和重试。上传或覆盖同路径录音后，已开放题目无需重新导入。题型说明只在答题卡侧栏展示。

R2 Bucket、公开域名、上传凭据、批量上传、题库关联和 Vercel 配置步骤见 [听力部署说明](docs/r2-audio.md)。密钥只用于本地上传，不提交到 GitHub；`npm run upload:audio -- --directory <资源根目录> --dry-run` 可预检目录，`npm run test:audio` 运行音频相关测试。

## 暗号与收藏练习

暗号功能暂不启用，普通答题和收藏练习均可直接进入，不需要暗号或已有 Cookie。

以后需要启用时，将 `src/lib/access-config.server.ts` 的 `PASSPHRASE_REQUIRED` 改为 `true`，提交后重新部署。启用后由服务端校验共享暗号，通过 HttpOnly Cookie 为当前浏览器保留 30 天的验证状态。仓库只保存暗号摘要，明文不会进入前端包。

需要更换暗号时，运行 `node scripts/rotate-activation-code.mjs`，妥善保存终端返回的新码，然后提交摘要文件并重新部署。更换后旧码和旧浏览器验证状态失效；安装依赖时不要运行此命令。

收藏页可以按收藏夹、等级、题型筛选，再点击“练习当前收藏”。练习只包含所选收藏题目，同篇文章仅对本次选中的子题统一提交；本次题目列表固定，期间修改收藏不会重置作答。结算、错题收藏及锁定复习流程与普通练习一致。
