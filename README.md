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
