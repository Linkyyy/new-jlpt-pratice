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
- Environment Variables：当前应用无需配置环境变量

应用包含服务端题库读取和 API，使用 Vercel 的 Next.js 部署方式。`next.config.ts` 已配置题库 JSON 文件追踪，生产部署包含练习和收藏接口需要的数据。

关联 GitHub 后，推送至生产分支触发生产部署，其他分支或 PR 生成预览部署。不要提交 `.env*`、`.vercel`、`node_modules` 或 `.next`。

题库格式与导入说明见 [src/data/README.md](src/data/README.md)。

## 激活码与收藏练习

开始普通答题或收藏练习前需要输入共享激活码。服务端校验后，通过 HttpOnly Cookie 为当前浏览器保留 30 天的激活状态。仓库只保存激活码摘要，明文不会进入前端包。

需要更换激活码时，运行 `node scripts/rotate-activation-code.mjs`，妥善保存终端返回的新码，然后提交摘要文件并重新部署。更换后旧码和旧浏览器激活状态失效；安装依赖时不要运行此命令。

收藏页可以按收藏夹、等级、题型筛选，再点击“练习当前收藏”。练习只包含所选收藏题目，同篇文章仅对本次选中的子题统一提交；本次题目列表固定，期间修改收藏不会重置作答。结算、错题收藏及锁定复习流程与普通练习一致。
