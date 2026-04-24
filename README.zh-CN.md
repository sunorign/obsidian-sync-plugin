# Obsidian GitHub Sync Plugin

[English](README.md)

这是一个基于 GitHub REST API 的 Obsidian 同步插件，用来把 Vault 内容同步到 GitHub，适合做跨设备备份和轻量协作，不需要在每台设备上安装 Git。

## 功能

### 核心同步动作
- `Sync Now`：双向同步，先拉取远端，再在没有冲突时推送本地
- `Mirror Local To GitHub`：以本地为准镜像到 GitHub，会上传本地文件、删除远端残留，并保留空文件夹结构
- 启动时自动拉取
- 实时监听本地文件变化
- 关闭时自动推送
- 支持按分钟配置自动推送

### 同步范围
- 默认同步 Markdown 文件
- 可选同步图片：`.png`、`.jpg`、`.jpeg`、`.gif`、`.webp`、`.svg`
- 可选同步 PDF：`.pdf`
- 支持配置 GitHub 仓库子路径和 Vault 子路径
- 拉取时会递归遍历远端完整目录树，嵌套目录也会包含在内

### 冲突处理
- 推送前基于 SHA 检测远端是否已变化
- 内置全屏冲突对比看板
- 支持按块选择 `Use Local`、`Use Remote`
- 支持 `Save Merged` 保存合并结果
- 支持隐藏未变化内容
- 冲突解决后会自动清理 `.conflict.local.md` 和 `.conflict.remote.md`

### 诊断能力
- 状态栏显示同步状态
- 同步摘要面板
- 同步历史面板
- 待处理状态拆分为：待推送、待处理冲突、最近失败

### 语言与设置
- 内置语言切换：`简体中文 / English`
- 设置页已收敛为 `核心功能` + `高级设置`

## 安装

### 手动安装
1. 下载发布产物。
2. 解压到 Vault 内的 `.obsidian/plugins/obsidian-github-sync/`。
3. 重启 Obsidian。
4. 在设置里启用插件。

### 从源码构建
```bash
git clone <repository-url>
cd obsidian-github-sync
npm install
npm run build
```

构建产物目录：

```text
build/obsidian-github-sync/
```

## GitHub Token

插件需要 GitHub Personal Access Token。

推荐权限：
- Repository access：仅目标仓库
- Repository permissions：`Contents: Read and write`

如果使用 Classic PAT，至少需要：
- `repo`

## 使用说明

### 1. 配置插件
在 Obsidian 的插件设置中填写：
- `GitHub Token`
- `Owner`
- `Repo`
- `Branch`
- `Remote Path`
- `Local Path`

然后点击 `Test Connection`。

### 2. 选择合适的同步动作
- 当本地和远端都可能有新内容，而且你希望优先保护双方改动时，用 `Sync Now`
- 当你希望 GitHub 最终和本地一模一样时，用 `Mirror Local To GitHub`

### 3. 空文件夹说明
GitHub 不能原生保存空目录。插件会通过占位文件保留目录结构：

```text
.obsidian-github-sync.keep
```

拉取时会自动恢复本地目录结构，并把占位文件从正常同步范围里隐藏掉。

### 4. 冲突处理流程
- 当 pull 或 push 发生冲突时，会自动打开对比看板
- 逐个检查冲突块
- 对每个冲突块选择 `Use Local` 或 `Use Remote`
- 也可以直接整份保留本地或远端
- 点击 `Save Merged` 后，合并结果会写回原文件

### 5. 高级工具
`高级设置` 中保留了这些功能：
- 图片和 PDF 同步开关
- 仅同步 Markdown
- 排除规则
- 分支管理
- 同步摘要
- 同步历史

## 架构

```text
src/
├── main.ts              插件入口与生命周期
├── settings.ts          设置界面
├── i18n.ts              中英文文案
├── types.ts             共享类型与默认配置
├── github-api.ts        GitHub API 封装
├── sync-manager.ts      拉取、推送、镜像流程编排
├── conflict-resolver.ts 冲突对比与合并看板
├── metadata-store.ts    SHA 与 base 快照存储
├── history-store.ts     同步历史存储
├── path-filter.ts       文件过滤与排除规则
├── status-bar.ts        状态栏更新
└── logger.ts            日志
```

## 说明

- `Test Connection` 只验证仓库访问能力。
- 当前冲突界面仍以两方 diff 和已保存的 base 快照为基础。
- 真正的三方冲突分类还在后续演进中。

## 开发

环境要求：
- Node.js 16+
- npm
- Obsidian v1.0+

常用命令：
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run check`

## License

MIT
