export interface PluginSettings {
    owner: string;
    repo: string;
    branch: string;
    repoPath: string;
    vaultSubPath: string;
    autoPullOnStartup: boolean;
    autoPushOnShutdown: boolean;
    autoPushInterval: number;  // Auto push interval in minutes (0 = disabled)
    syncMarkdownOnly: boolean;
    syncImages: boolean;       // Sync image files (.png, .jpg, .jpeg, .gif, .webp)
    syncPDF: boolean;          // Sync PDF files
    excludePatterns: string[];
    requestTimeoutMs: number;
    enableSyncHistory: boolean;    // Enable sync history logging
    maxSyncHistoryEntries: number; // Maximum number of history entries to keep
}

export interface BranchInfo {
    name: string;
    isDefault: boolean;
    protected: boolean;
}

export interface CreateBranchInput {
    branchName: string;
    baseBranch: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    owner: "",
    repo: "",
    branch: "main",
    repoPath: "",
    vaultSubPath: "",
    autoPullOnStartup: true,
    autoPushOnShutdown: true,
    autoPushInterval: 0,  // Disabled by default
    syncMarkdownOnly: true,
    syncImages: false,      // Disabled by default (increases sync time)
    syncPDF: false,         // Disabled by default (increases sync time)
    excludePatterns: [
        ".obsidian/workspace.json",
        ".obsidian/cache",
        ".trash"
    ],
    requestTimeoutMs: 15000,
    enableSyncHistory: true,     // Enabled by default
    maxSyncHistoryEntries: 100  // Keep last 100 entries
};

export interface SyncMetadata {
    remoteShaByPath: Record<string, string>;
    baseTextByPath?: Record<string, string>;
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

export interface DeleteFileInput {
    path: string;
    message: string;
    sha: string;
}

export type SyncStatus =
    | "idle"
    | "pulling"
    | "pushing"
    | "success"
    | "conflict"
    | "error";

export interface GitHubConfig {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    timeout: number;
}

export type SyncOperationType = 'pull' | 'push' | 'manual-push' | 'auto-push' | 'delete' | 'rename';

export interface SyncHistoryEntry {
    id: string;
    timestamp: number;
    operationType: SyncOperationType;
    filePath?: string;
    status: 'success' | 'conflict' | 'error';
    message: string;
    error?: string;
}

export interface SyncHistory {
    entries: SyncHistoryEntry[];
    maxEntries: number;
}
