# Obsidian GitHub Sync Plugin

[English](README.md) | 简体中文

Obsidian GitHub Sync Plugin 是一个专为 Obsidian 用户设计的文件级同步工具，通过 GitHub REST API 实现 Vault 内容与 GitHub 仓库的自动同步。解决多设备间笔记同步问题，无需本地 Git 环境即可实现云端备份与协作。

## 核心功能

### 自动同步
- **启动自动拉取**：Obsidian 加载时自动从 GitHub 同步最新内容
- **实时变更监听**：监听本地文件的创建和修改
- **关闭自动推送**：Obsidian 关闭时自动将本地变更推送到 GitHub

### 安全配置
- **Token 安全存储**：优先使用 Obsidian Secret Storage (Keychain)，提供本地加密隐藏文件降级方案
- **仓库配置**：支持自定义仓库路径、分支和同步目录
- **路径映射**：配置远端仓库路径与本地 Vault 子目录的映射关系

### 冲突处理
- **SHA 校验检测**：推送前检查远端是否已被修改
- **冲突文件生成**：检测到冲突时自动生成 `.conflict.local.md` 和 `.conflict.remote.md` 副本
- **用户提示**：通过 Notice 通知用户手动解决冲突

### 可视化监控
- **状态栏显示**：实时展示同步状态（pulling/pushing/success/conflict/error）
- **统一日志系统**：详细记录同步过程和错误信息

## 安装方法

### 手动安装
1. 下载插件的发布版本
2. 解压到 Obsidian Vault 的插件目录：`.obsidian/plugins/obsidian-github-sync/`
3. 重新启动 Obsidian
4. 在设置中启用插件

### 从源码构建
```bash
# 克隆仓库
git clone <repository-url>
cd obsidian-github-sync

# 安装依赖
npm install

# 构建插件
npm run build

# 安装插件到 Obsidian Vault（替换为你的 Vault 路径）
cp -r build/ <your-vault>/.obsidian/plugins/obsidian-github-sync/
```

## 前置准备：获取 GitHub Personal Access Token

### 什么是 GitHub Personal Access Token (PAT)

GitHub Personal Access Token (PAT) 是 GitHub 提供的一种认证方式，用于代替密码进行 API 访问。本插件使用 PAT 来访问你的 GitHub 仓库，实现文件的读取和写入。

### 如何获取 GitHub Personal Access Token

#### 步骤 1：访问 GitHub 设置

1. 登录你的 GitHub 账号
2. 点击右上角的头像 → **Settings**（设置）
3. 在左侧菜单中找到 → **Developer settings**（开发者设置）
4. 点击 → **Personal access tokens**（个人访问令牌）
5. 点击 → **Tokens (classic)**

#### 步骤 2：创建新 Token

1. 点击右上角的 **Generate new token**（生成新令牌）→ **Generate new token (classic)**
2. 如果提示需要验证密码，请输入你的 GitHub 密码
3. 在 **Note** 字段中填写一个描述，例如：`Obsidian GitHub Sync Plugin`
4. 在 **Expiration**（过期时间）中选择一个合适的过期时间
   - 推荐：选择 `90 days` 或 `365 days`
   - 如果需要长期使用，可以选择 `No expiration`（不建议）
5. 在 **Select scopes**（选择权限范围）中勾选：
   - ✅ `repo`（授予对私有仓库的完整访问权限）
   - 只需要勾选 `repo` 即可，其他权限不需要

#### 步骤 3：生成并复制 Token

1. 点击底部的 **Generate token**（生成令牌）按钮
2. GitHub 会生成一个新的 Token
3. **重要：** 立即复制这个 Token，保存到安全的地方
   - GitHub 只显示一次 Token，关闭页面后就看不到了
   - 如果丢失了，只能删除旧 Token 重新生成

#### 步骤 4：使用 Token

将复制的 Token 粘贴到 Obsidian 设置中的 GitHub Token 输入框，点击保存即可。

### 推荐使用 Fine-grained PAT（更安全）

GitHub 推荐使用 **Fine-grained PAT** 而不是 Classic PAT，它提供更精细的权限控制：

1. 在 **Personal access tokens** 页面选择 **Fine-grained tokens**
2. 点击 **Generate new token**
3. 填写 Token 名称和过期时间
4. 在 **Repository access** 中选择 → **Only select repositories**
5. 选择你要用于同步笔记的仓库
6. 在 **Permissions** → **Repository permissions** 中：
   - **Contents** → 设置为 **Read and write**
7. 点击 **Generate token**，复制 Token

这种方式更安全，Token 只能访问你指定的仓库，不会影响你的其他仓库。

### 权限要求

无论使用哪种 Token，都需要确保：

- 如果你的仓库是**私有**的：Token 需要有读取和写入权限
- 如果你的仓库是**公开**的：Token 只需要读取权限（但推送还是需要写入权限）
- 推荐授予 `contents:read & contents:write` 权限

## 使用说明

### 1. 配置插件
1. 打开 Obsidian 设置
2. 找到 "GitHub Sync" 插件
3. 填写 GitHub 仓库信息：
   - **Owner**：仓库所有者（用户名）
   - **Repo**：仓库名称
   - **Branch**：分支（默认 main）
   - **Repo Path**：仓库内同步目录（默认根目录）
4. 配置本地映射：
   - **Vault SubPath**：Vault 中的同步子目录（默认根目录）
5. 保存 GitHub Personal Access Token（PAT）
6. 点击 "测试连接" 验证配置

### 2. 管理 Token
- 插件会优先使用 Obsidian Secret Storage（加密存储）
- 如果 Token 无效或需要更新，点击 "删除 Token" 后重新输入
- 可以在设置中点击 "验证 Token" 检查当前 Token 的有效性

### 3. 同步操作
- **启动拉取**：插件加载时自动执行
- **手动同步**：目前需要通过重启插件或修改文件触发
- **查看日志**：在设置中点击 "查看同步日志" 可以查看详细的同步记录

## 技术架构

### 核心模块
```
src/
├── main.ts              # 插件入口与生命周期管理
├── settings.ts          # 设置面板 UI 与配置持久化
├── types.ts             # 全局类型定义与默认设置
├── github-api.ts        # GitHub REST API 封装
├── sync-manager.ts      # 同步流程控制核心
├── conflict-resolver.ts # 冲突文件生成逻辑
├── metadata-store.ts    # 文件 SHA 与同步元数据存储
├── path-filter.ts       # 文件过滤与排除规则
├── logger.ts            # 统一日志工具
└── status-bar.ts        # 状态栏 UI 更新
```

### 技术栈
- **TypeScript** 5.0+：类型安全的开发语言
- **esbuild**：快速的构建工具
- **@octokit/rest**：GitHub API 客户端
- **Obsidian API**：与 Obsidian 平台集成

## 开发指南

### 开发环境要求
- Node.js 16+
- npm 或 yarn
- Obsidian v1.0+

### 开发流程
1. 安装依赖：`npm install`
2. 开发模式：`npm run dev`（监听文件变化自动编译）
3. 构建生产版本：`npm run build`
4. 测试：`npm run test`

### 调试
- 在 Obsidian 中开启插件开发模式
- 使用 `console.log()` 在浏览器开发者工具中查看输出
- 查看同步日志：`.obsidian/plugins/obsidian-github-sync/logs/` 目录下的日志文件

## 注意事项

### 同步范围
- 支持同步 Markdown（`.md`）以及常见附件
- 附件支持：图片（.png, .jpg, .jpeg, .gif, .webp, .svg）和 PDF（.pdf）
- 自动排除以下目录：
  - `.obsidian/cache`
  - `.obsidian/workspace.json`
  - `.trash`
  - 插件自身生成的临时文件

### 冲突处理
- 冲突检测基于文件内容的 SHA 校验
- 冲突文件会保留在本地 Vault 中，需要手动合并
- 建议使用 Obsidian 的内置 diff 查看器或第三方工具解决冲突

### 可靠性
- `onunload()` 不是绝对可靠的唯一同步点，建议定期手动触发同步
- 网络异常时会自动重试，但最多 3 次
- 同步过程中插件崩溃可通过重新加载插件恢复状态

## 后续扩展

### 已实现功能 ✅
1. ✅ **插件骨架**：基础插件结构，可以在 Obsidian 中加载，包含状态栏和设置面板
2. ✅ **配置与安全存储**：支持配置仓库信息，Token 使用安全存储（Obsidian Keychain + 降级方案）
3. ✅ **GitHub API 封装**：完整实现 list/get/create/update/delete，通过 GitHub REST API
4. ✅ **启动自动拉取**：插件加载后自动将远程仓库内容同步到本地 Vault
5. ✅ **本地文件变更监听**：跟踪修改、创建、删除和重命名文件
6. ✅ **关闭自动推送**：Obsidian 关闭时将 dirty 文件推送到 GitHub
7. ✅ **删除/重命名同步**：将本地文件删除和重命名同步到远端，保持多设备文件结构一致
8. ✅ **基础冲突处理**：生成 `.conflict.local.md` 和 `.conflict.remote.md`，带内部链接便于手动合并
9. ✅ **状态栏显示**：展示同步状态（idle/pulling/pushing/success/conflict/error）
10. ✅ **统一日志系统**：结构化日志便于问题排查
11. ✅ **同步历史记录**：记录每次同步操作的详细历史，便于问题排查和变更追溯
12. ✅ **分支管理**：列出所有分支、切换当前分支、基于现有分支创建新分支
13. ✅ **双向增量同步优化**：拉取时只同步远程变更文件，自动清理远端已删除的本地文件，减少网络流量提高同步速度
14. ✅ **首次全量同步进度提示**：首次同步大量文件时每处理 10 个文件显示进度通知
15. ✅ **更精细的排除规则**：支持 glob 模式匹配，可在设置中编辑多个排除模式
16. ✅ **同步摘要面板**：展示当前分支、上次同步时间、待推送变更列表、已跟踪文件总数
17. ✅ **内置图形化 diff 冲突解决**：并排显示本地和远程版本，直接选择保留哪一方即可解决冲突
18. ✅ **定时自动 push**：可配置自动推送间隔（分钟），0 表示禁用
19. ✅ **手动"立即同步"命令**：在设置页面点击"Sync Now"按钮立即推送所有变更
20. ✅ **支持附件同步**：支持图片文件（.png, .jpg, .jpeg, .gif, .webp, .svg）和 PDF 文件（.pdf）
21. ✅ **改进冲突处理与 diff 支持**：冲突提示包含内部链接，可直接点击在 Obsidian 中打开对比

### 待实现功能 ⬜
- 所有计划功能都已实现！🎉

## 问题反馈

如果遇到问题或有功能建议，欢迎在 GitHub 仓库中提交 Issue 或 Pull Request。

## 许可证

MIT License

---

**提示**：这是一个开源插件，使用时请遵守 GitHub 的使用条款和 Obsidian 的插件开发规范。
