# Obsidian GitHub 自动同步插件实施方案（MVP）

## 1. 目标

开发一个 Obsidian 插件，实现以下能力：

1. **启动 Obsidian 时自动从 GitHub 拉取仓库内容到当前 Vault**
2. **关闭 Obsidian 时自动将本地变更 push 到 GitHub**
3. **插件设置页可配置 GitHub 授权信息与仓库信息**
4. **仅做文件级同步，不直接依赖本地 Git 命令**
5. **第一版优先保证可用性、稳定性、可调试性**

---

## 2. 推荐技术选型

### 2.1 开发语言
- **TypeScript**
- 原因：
  - Obsidian 官方插件生态主流就是 TypeScript
  - 有类型约束，适合后续维护
  - 和 Obsidian API 配合最好

### 2.2 构建方式
- 基于 **Obsidian Sample Plugin** 模板
- 使用：
  - `Node.js`
  - `npm`
  - `esbuild`

### 2.3 GitHub 交互方式
- 使用 **GitHub REST API**
- 不依赖本地 `git` 命令
- 不执行 `git pull / git push`
- 走文件读写 API，同步仓库中的文件内容

### 2.4 授权方式
- 使用 **GitHub Personal Access Token**
- 推荐使用 **fine-grained PAT**
- Token 不明文保存在普通 settings 中
- 使用 Obsidian 提供的 secret storage 能力保存敏感信息

---

## 3. MVP 范围

## 3.1 第一版只做这些功能
- 配置 GitHub 仓库信息
- 配置 GitHub Token
- 插件启动时自动拉取远程仓库内容
- 监听本地 Markdown 文件变更
- 插件卸载 / Obsidian 关闭时自动推送变更
- 状态栏展示同步状态
- 基础冲突检测与处理
- 基础错误提示

## 3.2 第一版明确不做
- 不支持完整 Git 历史
- 不支持 branch 切换界面
- 不支持自动 merge
- 不支持复杂冲突三方合并
- 不支持大规模二进制资源完整同步优化
- 不依赖系统安装 Git

---

## 4. 同步策略

## 4.1 核心思路
采用 **“GitHub API 文件级同步”** 模式：

- 启动时：从远端拉取文件，写入 Vault
- 编辑过程中：监听文件变化，记录 dirty 文件
- 关闭时：将 dirty 文件逐个更新到 GitHub

## 4.2 为什么不用本地 Git
原因：
1. 用户本地未必安装 Git
2. 跨平台兼容复杂
3. Obsidian 移动端后续不好扩展
4. 插件内调用 Git 子进程，异常处理更复杂
5. 第一版目标是快速落地 MVP，而不是实现完整 Git 客户端

---

## 5. 生命周期设计

## 5.1 onload
插件加载时执行：

1. 加载 settings
2. 初始化 secret storage
3. 初始化 GitHub API 客户端
4. 初始化同步管理器
5. 注册设置页
6. 注册文件监听器
7. 注册状态栏
8. 如果开启“启动自动拉取”，则异步执行 pull

注意：
- `onload()` 里不要做阻塞式重任务
- pull 用异步方式执行
- UI 上显示“同步中”

## 5.2 onunload
插件卸载时执行：

1. 如果开启“退出自动推送”，执行一次 push
2. 做资源清理
3. 注销事件监听

注意：
- `onunload()` 不是绝对可靠的唯一同步点
- 更稳妥的扩展方案是后续加入“定时自动 push”
- 但 MVP 先按“启动拉取 + 关闭推送”实现

---

## 6. 设置项设计

## 6.1 普通配置项
建议的 settings 结构：

```ts
interface PluginSettings {
  owner: string;                  // GitHub 仓库 owner
  repo: string;                   // GitHub 仓库名
  branch: string;                 // 分支，默认 main
  repoPath: string;               // 仓库内同步目录，默认空字符串表示根目录
  vaultSubPath: string;           // 本地 Vault 中映射目录，默认空字符串表示根目录
  autoPullOnStartup: boolean;     // 启动自动拉取
  autoPushOnShutdown: boolean;    // 关闭自动推送
  syncMarkdownOnly: boolean;      // 第一版默认 true
  excludePatterns: string[];      // 排除规则
  requestTimeoutMs: number;       // 请求超时
}
```

## 6.2 Secret 配置项
不要在普通 settings 中保存 token 明文。

建议：
- settings 中只保存：
  - `tokenSecretKeyName`
- 实际 token 存在 secret storage 中

例如：
- secret key name：`github-token`
- value：真实 PAT

## 6.3 默认配置建议

```ts
const DEFAULT_SETTINGS: PluginSettings = {
  owner: "",
  repo: "",
  branch: "main",
  repoPath: "",
  vaultSubPath: "",
  autoPullOnStartup: true,
  autoPushOnShutdown: true,
  syncMarkdownOnly: true,
  excludePatterns: [
    ".obsidian/workspace.json",
    ".obsidian/cache",
    ".trash"
  ],
  requestTimeoutMs: 15000
};
```

---

## 7. 同步文件范围

## 7.1 第一版同步范围
建议第一版只同步：
- `.md`

可选后续支持：
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.pdf`

## 7.2 第一版排除目录
默认应排除：
- `.obsidian/cache`
- `.obsidian/workspace.json`
- `.trash`
- 插件自身生成的临时文件
- 冲突副本目录（如单独定义）

原因：
- 避免无意义频繁同步
- 避免工作区临时状态污染仓库
- 降低冲突概率

---

## 8. GitHub API 设计

## 8.1 需要的能力
需要封装以下 API 能力：

1. 校验仓库访问是否可用
2. 获取目录下文件列表
3. 获取文件内容
4. 获取文件 sha
5. 创建文件
6. 更新文件
7. 删除文件（MVP 可暂不支持）
8. 获取最近一次请求错误详情

## 8.2 建议封装类

```ts
class GitHubApiClient {
  constructor(config: GitHubConfig) {}

  validateAccess(): Promise<void>;
  listFiles(path: string): Promise<RemoteFileMeta[]>;
  getFile(path: string): Promise<RemoteFileContent>;
  createOrUpdateFile(input: UpsertFileInput): Promise<void>;
  getFileSha(path: string): Promise<string | null>;
}
```

## 8.3 GitHub 文件元数据结构建议

```ts
interface RemoteFileMeta {
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
}
```

```ts
interface RemoteFileContent {
  path: string;
  sha: string;
  contentBase64: string;
}
```

---

## 9. 本地同步管理器设计

建议建立 `SyncManager` 统一管理同步行为。

## 9.1 核心职责
- pull 逻辑
- push 逻辑
- dirtyFiles 管理
- 同步状态机
- 冲突处理
- 日志输出

## 9.2 建议结构

```ts
class SyncManager {
  private dirtyFiles: Set<string>;
  private syncStatus: SyncStatus;

  initialize(): Promise<void>;
  pullOnStartup(): Promise<void>;
  pushOnShutdown(): Promise<void>;
  markDirty(path: string): void;
  shouldSync(path: string): boolean;
}
```

## 9.3 同步状态建议

```ts
type SyncStatus =
  | "idle"
  | "pulling"
  | "pushing"
  | "success"
  | "conflict"
  | "error";
```

---

## 10. 启动拉取流程

## 10.1 流程图式描述

1. 读取 settings
2. 读取 token
3. 校验 GitHub 仓库是否可访问
4. 获取远程仓库指定目录文件列表
5. 过滤出允许同步的文件
6. 对每个文件读取内容
7. 将远端文件写入本地 Vault
8. 记录本次 pull 完成状态

## 10.2 关键细节
- 远端文件写入本地前，先判断本地是否存在
- 如果本地不存在，直接创建
- 如果本地存在：
  - 若本地无修改且远端不同，则覆盖
  - 若本地已有修改，则进入冲突逻辑

## 10.3 建议附加能力
为每个文件记录一份本地同步元数据，例如：
- 上次同步的远端 sha
- 上次同步时间

可以单独存一份插件元数据，例如：

```ts
interface SyncMetadata {
  remoteShaByPath: Record<string, string>;
  lastSyncAt?: number;
}
```

用途：
- push 时判断是否基于旧 sha
- pull 时判断远端是否发生变化

---

## 11. 本地文件变更监听

## 11.1 监听对象
监听 Obsidian Vault 里的文件事件，例如：
- modify
- create
- delete（MVP 可先不支持远端删除）
- rename（MVP 可先简化为“新建+旧文件遗留”）

## 11.2 行为
当检测到文件变化时：

1. 判断是否属于同步范围
2. 判断是否命中排除规则
3. 标记为 dirty
4. 更新状态栏提示

## 11.3 建议逻辑

```ts
onFileModified(file) => {
  if (!shouldSync(file.path)) return;
  dirtyFiles.add(file.path);
}
```

注意：
- 启动 pull 写回本地时，可能也会触发 modify 事件
- 需要一个“内部写入保护标记”避免将 pull 导致的写入误判为用户修改

例如：
```ts
private internalWritePaths = new Set<string>();
```

写入前放入集合，写入后移除；监听时若命中该集合则忽略

---

## 12. 关闭推送流程

## 12.1 流程图式描述

1. 遍历 dirtyFiles
2. 读取本地文件内容
3. 查询远端当前 sha
4. 对比本地记录的上次同步 sha 与远端当前 sha
5. 若一致，则正常更新远端文件
6. 若不一致，说明远端已变更，进入冲突处理
7. 成功后更新本地 sync metadata
8. 清理 dirty 标记

## 12.2 为什么更新远端前要查 sha
因为 GitHub contents API 更新文件时通常需要提供目标文件当前 sha，防止误覆盖。

这正好可以作为冲突检测依据：
- **远端当前 sha == 上次同步记录的 sha**：说明没有别人改过，可以更新
- **远端当前 sha != 上次同步记录的 sha**：说明远端已被改，不能盲目覆盖

---

## 13. 冲突处理策略

## 13.1 第一版策略
**不自动 merge，只做冲突落盘 + 提示**

## 13.2 冲突场景
例如：
- 本地修改了 `note.md`
- 另一个设备也修改了 GitHub 上的 `note.md`
- 当前设备关闭 Obsidian 时尝试 push

此时不能直接覆盖。

## 13.3 建议处理方式
生成两个文件：

- `note.conflict.local.md`
- `note.conflict.remote.md`

同时：
- 保留原本地文件不动
- 给出 Notice 提示
- 状态栏显示 conflict

## 13.4 冲突处理器接口建议

```ts
class ConflictResolver {
  resolvePushConflict(input: {
    path: string;
    localContent: string;
    remoteContent: string;
  }): Promise<void>;
}
```

---

## 14. 状态栏与日志

## 14.1 状态栏显示建议
状态栏可显示如下状态之一：

- `GitSync: idle`
- `GitSync: pulling...`
- `GitSync: pushing...`
- `GitSync: success`
- `GitSync: conflict`
- `GitSync: error`

## 14.2 日志建议
建议加一个统一日志方法：

```ts
class Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
```

日志用途：
- 排查同步失败
- 输出 GitHub API 错误
- 输出哪些文件被同步
- 输出冲突文件路径

---

## 15. 插件目录结构建议

```text
src/
  main.ts
  settings.ts
  types.ts
  github-api.ts
  sync-manager.ts
  conflict-resolver.ts
  path-filter.ts
  logger.ts
  metadata-store.ts
```

---

## 16. 各文件职责说明

## 16.1 `main.ts`
职责：
- 插件入口
- `onload()` / `onunload()`
- 注册事件
- 注册设置页
- 注册状态栏
- 初始化 SyncManager

## 16.2 `settings.ts`
职责：
- 定义 `PluginSettings`
- 默认配置
- 设置页 UI
- 保存普通配置
- 提供 token 保存 / 读取入口

## 16.3 `types.ts`
职责：
- 统一定义 TS 类型
- 避免类型散落

## 16.4 `github-api.ts`
职责：
- 封装 GitHub REST API 调用
- 处理认证、headers、错误码
- 提供 list/get/upsert 能力

## 16.5 `sync-manager.ts`
职责：
- 管理 pull / push 全流程
- 管理 dirtyFiles
- 管理 syncStatus
- 协调 metadata 与 conflict resolver

## 16.6 `conflict-resolver.ts`
职责：
- 冲突副本生成
- Notice 提示
- 冲突日志输出

## 16.7 `path-filter.ts`
职责：
- 判断文件是否应同步
- 后缀过滤
- 排除规则匹配

## 16.8 `logger.ts`
职责：
- 统一日志输出
- 可后续扩展为 debug 开关

## 16.9 `metadata-store.ts`
职责：
- 保存每个文件上次同步的 sha
- 保存最近一次同步时间
- 封装读写逻辑

---

## 17. 类型定义建议

```ts
export interface PluginSettings {
  owner: string;
  repo: string;
  branch: string;
  repoPath: string;
  vaultSubPath: string;
  autoPullOnStartup: boolean;
  autoPushOnShutdown: boolean;
  syncMarkdownOnly: boolean;
  excludePatterns: string[];
  requestTimeoutMs: number;
}

export interface SyncMetadata {
  remoteShaByPath: Record<string, string>;
  lastSyncAt?: number;
}

export interface RemoteFileMeta {
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
}

export interface RemoteFileContent {
  path: string;
  sha: string;
  contentBase64: string;
}

export interface UpsertFileInput {
  path: string;
  contentBase64: string;
  message: string;
  sha?: string;
}
```

---

## 18. 关键实现细节要求

## 18.1 路径映射
必须明确远端仓库路径与本地 Vault 路径的映射关系。

例：
- repoPath = `notes`
- vaultSubPath = `GithubSync`

则：
- 远端 `notes/a.md`
- 本地 `GithubSync/a.md`

## 18.2 编码
- 文本文件统一按 UTF-8 处理
- 与 GitHub API 交互时使用 base64

## 18.3 异常处理
任何 API 请求失败时：
- 不要 silent fail
- 必须输出日志
- 必须给用户 Notice
- 状态栏更新为 `error`

## 18.4 超时控制
所有 GitHub API 请求需要加超时控制，避免启动或关闭时一直卡住。

## 18.5 防重入
pull / push 执行时需要加锁，避免重复执行。

例如：
```ts
private isPulling = false;
private isPushing = false;
```

---

## 19. 建议的实现步骤

## 第 1 步：创建插件骨架
目标：
- 用 sample plugin 跑通基础插件
- 能在 Obsidian 中加载
- 能显示状态栏与设置页

完成标准：
- 插件可以正常启停
- 设置项能保存
- 状态栏显示固定文本

## 第 2 步：实现 settings + secret storage
目标：
- 配置 owner/repo/branch/repoPath 等
- 单独保存 GitHub token
- 增加“测试连接”按钮

完成标准：
- 用户可以保存 token
- 能测试仓库是否可访问

## 第 3 步：封装 GitHub API
目标：
- 实现 list/get/create/update
- 统一错误处理

完成标准：
- 能读取远程目录
- 能拉取单个文件
- 能更新单个文件

## 第 4 步：实现启动自动 pull
目标：
- `onload` 后根据开关自动同步远端到本地

完成标准：
- 远端 `.md` 文件能成功写入 Vault
- 内部写入不会误加入 dirtyFiles

## 第 5 步：实现本地文件监听
目标：
- 监听 `.md` 文件修改
- 正确标记 dirty

完成标准：
- 用户修改本地文件后，dirtyFiles 正确增加

## 第 6 步：实现关闭自动 push
目标：
- `onunload` 时将 dirtyFiles 推送远端

完成标准：
- 推送成功后 dirtyFiles 清空
- metadata 中 sha 更新

## 第 7 步：实现冲突处理
目标：
- 远端 sha 变更时不直接覆盖
- 生成冲突副本文件

完成标准：
- 冲突场景可复现并可恢复
- 用户能看到提示

## 第 8 步：补充日志与用户提示
目标：
- 同步过程可排查
- 失败信息清晰

完成标准：
- 用户能知道失败在哪一步
- 开发者能通过日志定位问题

---

## 20. 给 AI 编辑器的明确实施要求

请严格按以下要求实现：

1. **使用 TypeScript**
2. **基于 Obsidian Sample Plugin 结构开发**
3. **不要调用系统 git 命令**
4. **GitHub 同步使用 REST API**
5. **第一版只同步 `.md` 文件**
6. **Token 不要明文保存到普通 settings**
7. **必须实现设置页**
8. **必须实现启动自动拉取**
9. **必须实现关闭自动推送**
10. **必须实现文件变更监听**
11. **必须实现基础冲突处理**
12. **必须实现状态栏展示**
13. **必须有日志输出**
14. **所有关键方法写清楚注释**
15. **代码按模块拆分，不要全部堆在 main.ts**
16. **先保证 MVP 可跑，再考虑扩展**

---

## 21. 后续可扩展方向（不是 MVP 必做）

后续版本可以考虑增加：

1. 定时自动 push
2. 手动“立即同步”命令
3. 同步历史记录
4. 支持附件同步
5. 删除 / 重命名同步
6. branch 管理
7. 冲突 diff 视图
8. 双向增量同步优化
9. 首次全量同步进度条
10. 更细粒度的排除规则
11. 同步摘要面板

---

## 22. 最终交付目标

第一版完成后，应达到以下结果：

- 用户安装插件后，可在设置页填写：
  - GitHub Token
  - owner
  - repo
  - branch
  - repoPath
  - vaultSubPath
- 打开 Obsidian 时自动从 GitHub 拉取 Markdown 文件
- 用户编辑本地 Markdown 文件后，插件能记录变更
- 关闭 Obsidian 时自动 push 这些变更到 GitHub
- 出现冲突时不会盲目覆盖，而是生成冲突副本
- 状态栏能看到同步状态
- 出错时有 Notice 和日志可排查

---

## 23. 一句话开发指导

**先做一个“稳定的文件同步插件”，不要一开始就做“完整 Git 客户端”。**

优先级顺序应该是：

**能配置 → 能连接 → 能拉取 → 能监听 → 能推送 → 能处理冲突 → 能排查错误**

这才是最适合第一版落地的路径。
