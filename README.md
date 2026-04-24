# Obsidian GitHub Sync Plugin

[简体中文](README.zh-CN.md)

Sync files from your Obsidian vault to GitHub through the GitHub REST API. The plugin is designed for backup and lightweight collaboration without requiring Git on every device.

## Features

### Core sync actions
- `Sync Now`: two-way sync that pulls first, then pushes only when pull finishes without conflicts
- `Mirror Local To GitHub`: local-first mirror that uploads local files, deletes remote leftovers, and preserves empty folders with placeholders
- Auto pull on startup
- Real-time local file watching
- Auto push on shutdown
- Scheduled auto push with configurable interval

### Sync scope
- Markdown sync by default
- Optional image sync: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
- Optional PDF sync: `.pdf`
- Repo subpath and vault subpath mapping
- Recursive remote tree pull, so nested directories are included

### Conflict handling
- SHA-based remote change detection before push
- Full-screen compare view
- Block-level merge workflow with `Use Local`, `Use Remote`, and `Save Merged`
- Optional unchanged-block folding
- Conflict artifacts are cleaned automatically after resolution

### Diagnostics
- Status bar sync state
- Sync summary panel
- Sync history viewer
- Pending-state breakdown: pending push, conflicts, recent failures

### Language and settings
- Built-in language switch: `简体中文 / English`
- Simplified settings layout with `Core` and `Advanced` sections

## Installation

### Manual install
1. Download a release build.
2. Extract it to `.obsidian/plugins/obsidian-github-sync/` inside your vault.
3. Restart Obsidian.
4. Enable the plugin in Settings.

### Build from source
```bash
git clone <repository-url>
cd obsidian-github-sync
npm install
npm run build
```

Build output:

```text
build/obsidian-github-sync/
```

## GitHub token

Use a GitHub Personal Access Token.

Recommended permissions:
- Repository access: target repository only
- Repository permissions: `Contents: Read and write`

If you use a classic PAT, grant:
- `repo`

## Usage

### 1. Configure the plugin
In Obsidian Settings for this plugin, fill in:
- `GitHub Token`
- `Owner`
- `Repo`
- `Branch`
- `Remote Path`
- `Local Path`

Then click `Test Connection`.

### 2. Pick the right sync action
- Use `Sync Now` when both local and remote may contain new changes you want to preserve.
- Use `Mirror Local To GitHub` when local is the source of truth and GitHub must become identical to local.

### 3. Empty folder behavior
GitHub does not store empty directories natively. The plugin preserves them by writing a placeholder file:

```text
.obsidian-github-sync.keep
```

During pull, the plugin recreates the local folder structure and hides the placeholder from normal sync scope.

### 4. Conflict workflow
- When a pull or push conflict is detected, the compare view opens.
- Review each conflict block.
- Choose `Use Local` or `Use Remote` per block, or accept one side entirely.
- Click `Save Merged` to write the merged content back to the original file.

### 5. Advanced tools
The `Advanced` section includes:
- Image and PDF sync toggles
- Markdown-only mode
- Exclusion patterns
- Branch management
- Sync summary
- Sync history

## Architecture

```text
src/
├── main.ts              Plugin entry and lifecycle
├── settings.ts          Settings UI
├── i18n.ts              Language strings
├── types.ts             Shared types and defaults
├── github-api.ts        GitHub API wrapper
├── sync-manager.ts      Pull/push/mirror orchestration
├── conflict-resolver.ts Conflict compare and merge UI
├── metadata-store.ts    SHA and base snapshot storage
├── history-store.ts     Sync history storage
├── path-filter.ts       File inclusion and exclusion logic
├── status-bar.ts        Status bar updates
└── logger.ts            Logging
```

## Notes

- `Test Connection` only verifies repository access.
- The current conflict UI is still based on two-way diff plus saved base snapshots.
- Three-way conflict classification is planned, but not fully implemented yet.

## Development

Requirements:
- Node.js 16+
- npm
- Obsidian v1.0+

Scripts:
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run check`

## License

MIT
