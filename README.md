# Obsidian GitHub Sync Plugin

Obsidian GitHub Sync Plugin 是一个专为 Obsidian 用户设计的文件级同步工具，通过 GitHub REST API 实现 Vault 内容与 GitHub 仓库的自动同步。解决多设备间笔记同步问题，无需本地 Git 环境即可实现云端备份与协作。

## 核心功能

### 自动同步
- **启动自动拉取**：Obsidian 加载时自动从 GitHub 同步最新内容
- **实时变更监听**：监听本地 Markdown 文件的创建和修改
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

# 将插件复制到 Obsidian Vault（替换为你的 Vault 路径）
cp -r dist/<vault-path>/.obsidian/plugins/obsidian-github-sync/
```

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
- 第一版只同步 `.md` 文件
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

### 计划功能
1. 定时自动 push
2. 手动"立即同步"命令
3. 同步历史记录
4. 支持附件同步（.png, .jpg, .pdf 等）
5. 删除/重命名同步
6. 分支管理
7. 冲突 diff 视图
8. 双向增量同步优化

## 问题反馈

如果遇到问题或有功能建议，欢迎在 GitHub 仓库中提交 Issue 或 Pull Request。

## 许可证

MIT License

---

**提示**：这是一个开源插件，使用时请遵守 GitHub 的使用条款和 Obsidian 的插件开发规范。