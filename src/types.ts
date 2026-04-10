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
    excludePatterns: string[];
    requestTimeoutMs: number;
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
    excludePatterns: [
        ".obsidian/workspace.json",
        ".obsidian/cache",
        ".trash"
    ],
    requestTimeoutMs: 15000
};

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
