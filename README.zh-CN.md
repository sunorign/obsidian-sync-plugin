# Obsidian GitHub Sync Plugin

[English](README.md)

Obsidian GitHub Sync Plugin 是一个基于 GitHub REST API 的 Obsidian 文件同步插件，用来把你的 Vault 内容同步到 GitHub 仓库，适合不想在本地安装 Git、但希望做跨设备备份和协作的用户。

## 功能特性

### 同步流程
- 启动时自动拉取远端内容
- 实时监听本地文件变更
- 关闭 Obsidian 时自动推送
- 支持按分钟配置定时自动推送
- `Sync Now` 现在是双向同步：
  先拉取远端，再在没有冲突和拉取错误时推送本地改动

### 仓库同步
- 默认同步 Markdown 文件
- 可选同步图片：
  `.png`、`.jpg`、`.jpeg`、`.gif`、`.webp`、`.svg`
- 可选同步 PDF：
  `.pdf`
- 支持配置 GitHub 仓库子目录与 Vault 子目录映射
- 当前拉取逻辑会遍历完整仓库文件树，嵌套目录也会同步

### 冲突处理
- 推送前通过 SHA 检测远端是否发生变化
- 发生冲突时生成：
  `.conflict.local.md` 与 `.conflict.remote.md`
- 内置全屏冲突对比看板
- 支持按冲突块选择本地或远端内容，再保存合并结果
- 支持隐藏未变化内容，只聚焦差异块
- 冲突解决完成后会自动清理冲突副本文件

### 可观测性
- 状态栏显示同步状态
- 提供同步历史查看面板
- 提供同步摘要面板，并区分：
  待推送文件、待处理冲突、最近失败文件

### 安全性
- 优先使用 Obsidian Secret Storage 保存 Token
- 无 Keychain 时降级到插件目录本地文件

## 安装方式

### 手动安装
1. 下载构建产物。
2. 解压到你的 Vault 插件目录：
   `.obsidian/plugins/obsidian-github-sync/`
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
`build/obsidian-github-sync/`

将该目录复制到 Vault 插件目录下：
```bash
cp -r build/obsidian-github-sync <your-vault>/.obsidian/plugins/
```

## GitHub Token

插件需要 GitHub Personal Access Token。

### 推荐方式
使用 Fine-grained PAT，并授予：
- Repository access：仅目标仓库
- Repository permissions：
  `Contents: Read and write`

### Classic PAT
如果使用 Classic PAT，至少需要：
- `repo`

## 使用说明

### 1. 插件配置
在 Obsidian 设置 -> 本插件 中填写：
- `Owner`：GitHub 用户或组织
- `Repo`：仓库名
- `Branch`：默认 `main`
- `Repo Path`：仓库内同步子目录，留空表示仓库根目录
- `Vault SubPath`：Vault 内同步子目录，留空表示 Vault 根目录

填入 Token 后保存，并使用 `Test Connection` 验证。

### 2. 同步行为
- 启动拉取：把远端变更同步到本地
- 关闭推送：把本地改动上传到 GitHub
- 定时推送：按配置间隔推送 dirty 文件
- `Sync Now` 当前行为：
  1. 先执行拉取
  2. 如果拉取发现冲突，则停止，不继续推送
  3. 如果拉取报错，则停止，不继续推送
  4. 只有拉取成功且无冲突时，才继续推送本地改动

### 3. 冲突处理流程
- 检测到 push 或 pull 冲突后，会打开内置 compare 看板
- 每个冲突块都可以选择 `Use Local` 或 `Use Remote`
- 点击 `Save Merged` 会把合并结果写回原始文件
- 完成后下一次同步会基于新的本地合并结果继续执行

### 4. 诊断与排查
- `View Summary`：
  查看当前分支、最近同步时间、待推送文件、冲突文件、失败文件
- `View History`：
  查看最近同步操作、状态和错误信息

## 架构说明

核心模块：

```text
src/
├─ main.ts              插件入口与生命周期
├─ settings.ts          设置面板
├─ types.ts             共享类型与默认配置
├─ github-api.ts        GitHub API 封装
├─ sync-manager.ts      拉取/推送流程编排
├─ conflict-resolver.ts 冲突对比与合并看板
├─ metadata-store.ts    SHA 与 base 快照存储
├─ history-store.ts     同步历史存储
├─ path-filter.ts       文件过滤与排除规则
├─ status-bar.ts        状态栏更新
└─ logger.ts            日志
```

## 近期改动

当前代码已经包含以下较新的行为：
- `Sync Now` 从“仅推送”改为“双向同步”
- 修复远端嵌套目录拉取
- 部分推送失败时不再清空所有 dirty 文件
- 重构冲突看板，支持按块合并
- 冲突看板支持隐藏未变化内容
- 同步摘要区分待推送、冲突、失败三类状态
- 同步历史弹窗改宽，更适合查看日志

## 注意事项

- `onunload()` 不是绝对可靠的最后一次同步时机，仍建议搭配定时推送使用。
- `Test Connection` 只验证仓库访问能力，不能完全代表 pull / push 在所有文件状态下都一定成功。
- 当前冲突看板主要还是两方 diff，并结合已保存的 base 快照为后续三方比较做准备；真正的三方冲突分类还在继续演进中。

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
