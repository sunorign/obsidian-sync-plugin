# Obsidian GitHub Sync Plugin

English | [简体中文](README.zh-CN.md)

Obsidian GitHub Sync Plugin is a file-level sync tool for Obsidian. It syncs your vault content to a GitHub repository via the GitHub REST API, so you can back up and collaborate across devices without installing Git locally.

## Key Features

### Automatic sync
- **Auto pull on startup**: fetch latest content from GitHub when Obsidian loads
- **Real-time change watching**: watch local file creations/updates
- **Auto push on shutdown**: push local changes when Obsidian closes
- **Scheduled auto push**: configurable interval (minutes), `0` to disable
- **Sync now**: one-click/manual push of all pending changes

### Secure configuration
- **Safe token storage**: prefers Obsidian Secret Storage (Keychain); falls back to a local encrypted hidden file
- **Repository options**: configurable owner/repo/branch, repo path, and local vault subpath mapping

### Conflict handling
- **SHA-based detection**: checks remote changes before pushing
- **Conflict artifacts**: generates `.conflict.local.md` and `.conflict.remote.md` copies when a conflict is detected
- **User notification**: prompts via Obsidian Notice for manual resolution

### Observability
- **Status bar**: shows sync state (pulling/pushing/success/conflict/error)
- **Unified logging**: detailed sync logs and error information

### Attachment sync
- **Supported attachments**: images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`) and PDFs (`.pdf`)

## Installation

### Manual install
1. Download a release build
2. Unzip into your vault plugin directory: `.obsidian/plugins/obsidian-github-sync/`
3. Restart Obsidian
4. Enable the plugin in Settings

### Build from source
```bash
git clone <repository-url>
cd obsidian-github-sync

npm install
npm run build
```

Then copy the build output into your vault plugin directory:
```bash
cp -r build/ <your-vault>/.obsidian/plugins/obsidian-github-sync/
```

## Prerequisite: GitHub Personal Access Token (PAT)

This plugin uses a GitHub Personal Access Token (PAT) to access your repository content via API.

### Recommended: Fine-grained PAT (safer)
Create a fine-grained token, grant access to only the target repository, and set:
- **Repository permissions** → **Contents**: Read and write

### Classic PAT
If you use a classic token, grant:
- `repo` scope

### Permission notes
- Private repos need read + write permissions
- Public repos still need write permissions to push

## Usage

### 1. Configure the plugin
In Obsidian Settings → this plugin:
- **Owner**: GitHub username/org
- **Repo**: repository name
- **Branch**: default `main`
- **Repo Path**: directory in the repo to sync (default root)
- **Vault SubPath**: local vault subdirectory to sync (default root)

Paste your PAT, save, then use **Test Connection** to validate.

### 2. Manage your token
- The plugin prefers Secret Storage for the token
- If your token expires, delete it in settings and paste a new one
- Use **Verify Token** to check validity

### 3. Sync workflow
- Pull runs automatically on plugin load
- Push runs on shutdown and/or on a schedule (if enabled)
- Use **Sync Now** to push immediately
- Use **View Logs** for detailed sync output

## Architecture

### Core modules
```
src/
├── main.ts              # plugin entry and lifecycle
├── settings.ts          # settings UI and persistence
├── types.ts             # types and default settings
├── github-api.ts        # GitHub REST API wrapper
├── sync-manager.ts      # sync orchestration
├── conflict-resolver.ts # conflict artifact generation
├── metadata-store.ts    # SHA + sync metadata storage
├── path-filter.ts       # file filtering and exclusions
├── logger.ts            # unified logger
└── status-bar.ts        # status bar updates
```

## Development

### Requirements
- Node.js 16+
- npm or yarn
- Obsidian v1.0+

### Scripts
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm run test`

### Debugging
- Enable Obsidian developer mode
- Use the devtools console for logs
- Sync logs are stored under `.obsidian/plugins/obsidian-github-sync/logs/`

## Notes

### Exclusions
The plugin excludes common non-content paths such as:
- `.obsidian/cache`
- `.obsidian/workspace.json`
- `.trash`
- plugin-generated temporary files

### Reliability
- `onunload()` is not a perfect “last chance” sync hook; consider using scheduled push
- Network failures retry automatically (up to 3 times)

## Roadmap
- Sync history
- Delete/rename sync
- Branch management
- Bidirectional incremental sync improvements

## Feedback

Issues and pull requests are welcome.

## License

MIT License
