# Obsidian GitHub Sync Plugin

[简体中文](README.zh-CN.md)

Obsidian GitHub Sync Plugin syncs files in your Obsidian vault to a GitHub repository through the GitHub REST API. It is designed for users who want cross-device backup and collaboration without installing Git locally.

## Features

### Sync workflow
- Auto pull on startup
- Real-time local file watching
- Auto push on shutdown
- Scheduled auto push with configurable interval
- `Sync Now` performs a bidirectional sync:
  pull remote changes first, then push local changes if no conflicts or pull errors are found

### Repository sync
- Sync Markdown files by default
- Optional image sync: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
- Optional PDF sync: `.pdf`
- Supports repo subpath and vault subpath mapping
- Pull now uses full repository tree traversal, so nested folders are included

### Conflict handling
- SHA-based remote change detection before push
- Local conflict artifacts: `.conflict.local.md` and `.conflict.remote.md`
- Full-screen compare view for conflict resolution
- Block-level merge workflow:
  choose local or remote per conflict block, then save merged content
- Supports hiding unchanged blocks to focus on diffs
- Conflict artifacts are cleaned up automatically after resolution

### Observability
- Status bar sync state
- Sync history viewer
- Sync summary panel with categorized pending state:
  pending push files, conflicts to resolve, recently failed files

### Security
- Token prefers Obsidian Secret Storage
- Falls back to a local plugin file when keychain is unavailable

## Installation

### Manual install
1. Download a release build.
2. Extract it into your vault plugin directory:
   `.obsidian/plugins/obsidian-github-sync/`
3. Restart Obsidian.
4. Enable the plugin in Settings.

### Build from source
```bash
git clone <repository-url>
cd obsidian-github-sync
npm install
npm run build
```

Build output is generated in:
`build/obsidian-github-sync/`

Copy that folder into your vault:
```bash
cp -r build/obsidian-github-sync <your-vault>/.obsidian/plugins/
```

## GitHub token

This plugin requires a GitHub Personal Access Token.

### Recommended
Use a fine-grained PAT and grant:
- Repository access: only the target repository
- Repository permissions:
  `Contents: Read and write`

### Classic PAT
If you use a classic token, grant:
- `repo`

## Usage

### 1. Configure the plugin
In Obsidian Settings -> this plugin:
- `Owner`: GitHub user or organization
- `Repo`: repository name
- `Branch`: default `main`
- `Repo Path`: subdirectory in the repository, empty means repo root
- `Vault SubPath`: subdirectory in the vault, empty means vault root

Paste the token, save it, then use `Test Connection`.

### 2. Sync behavior
- Startup pull downloads remote changes into the vault
- Shutdown push uploads local changes
- Scheduled push uploads dirty files at the configured interval
- `Sync Now`:
  1. pulls remote changes
  2. stops if pull conflicts are found
  3. stops if pull errors occur
  4. pushes remaining local changes only when pull is clean

### 3. Conflict workflow
- When a push or pull conflict is detected, the plugin opens the compare view
- For each conflict block, choose `Use Local` or `Use Remote`
- Click `Save Merged` to write the merged result back to the original file
- The next sync should continue from the updated local merged content

### 4. Diagnostics
- `View Summary` shows tracked files, pending push files, conflicts, and recent failures
- `View History` shows the recent sync log with operation type and error details

## Architecture

Core modules:

```text
src/
├─ main.ts              Plugin entry and lifecycle
├─ settings.ts          Settings UI
├─ types.ts             Shared types and defaults
├─ github-api.ts        GitHub API wrapper
├─ sync-manager.ts      Pull/push orchestration
├─ conflict-resolver.ts Conflict compare and merge UI
├─ metadata-store.ts    SHA and base snapshot storage
├─ history-store.ts     Sync history storage
├─ path-filter.ts       File inclusion and exclusion logic
├─ status-bar.ts        Status bar updates
└─ logger.ts            Logging
```

## Recent changes

The current codebase includes the following newer behavior:
- `Sync Now` is now bidirectional instead of push-only
- Remote pull covers nested folders correctly
- Partial push failures no longer clear all dirty files
- Conflict compare view supports block-level merge
- Compare view can hide unchanged blocks
- Sync summary distinguishes pending, conflicted, and failed files
- Sync history modal is wider and easier to read

## Notes

- `onunload()` is not a guaranteed last-chance sync hook. Scheduled push is still recommended.
- `Test Connection` only validates repository access. A successful test does not guarantee pull or push logic is error-free for every file state.
- Current conflict UI is based on two-way diff plus saved base snapshots. Three-way conflict classification is planned but not fully implemented yet.

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
