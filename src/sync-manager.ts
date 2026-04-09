import { App, TFile, normalizePath, Notice } from "obsidian";
import { GitHubApiClient } from "./github-api";
import { PluginSettings, SyncStatus, RemoteFileMeta } from "./types";
import { MetadataStore } from "./metadata-store";
import { PathFilter } from "./path-filter";
import { Logger } from "./logger";
import { StatusBar } from "./status-bar";
import { ConflictResolver } from "./conflict-resolver";

export class SyncManager {
    private app: App;
    private githubApi: GitHubApiClient;
    private settings: PluginSettings;
    private metadataStore: MetadataStore;
    private pathFilter: PathFilter;
    private logger: Logger;
    private statusBar: StatusBar;
    private conflictResolver: ConflictResolver;

    private dirtyFiles: Set<string> = new Set();
    private isPulling = false;
    private isPushing = false;
    private internalWritePaths: Set<string> = new Set();

    constructor(
        app: App,
        githubApi: GitHubApiClient,
        settings: PluginSettings,
        metadataStore: MetadataStore,
        pathFilter: PathFilter,
        logger: Logger,
        statusBar: StatusBar,
        conflictResolver: ConflictResolver
    ) {
        this.app = app;
        this.githubApi = githubApi;
        this.settings = settings;
        this.metadataStore = metadataStore;
        this.pathFilter = pathFilter;
        this.logger = logger;
        this.statusBar = statusBar;
        this.conflictResolver = conflictResolver;
    }

    async pullOnStartup(): Promise<void> {
        if (this.isPulling) return;
        this.isPulling = true;
        this.statusBar.setStatus("pulling");
        this.logger.info("Starting initial pull...");

        try {
            const remoteFiles = await this.githubApi.listFiles(this.settings.repoPath);
            const syncFiles = remoteFiles.filter(file => this.pathFilter.shouldSync(file.path));

            for (const file of syncFiles) {
                await this.pullFile(file);
            }

            this.metadataStore.updateLastSyncTime();
            await this.metadataStore.save();
            this.statusBar.setStatus("success");
            this.logger.info("Initial pull completed successfully.");
        } catch (error: any) {
            this.statusBar.setStatus("error");
            this.logger.error("Failed during initial pull", error);
            new Notice(`GitHub Sync: Pull failed - ${error.message}`);
        } finally {
            this.isPulling = false;
        }
    }

    private async pullFile(remoteFile: RemoteFileMeta): Promise<void> {
        const localPath = this.mapToLocalPath(remoteFile.path);
        const localFile = this.app.vault.getAbstractFileByPath(localPath);
        
        const lastKnownSha = this.metadataStore.getSha(remoteFile.path);
        if (lastKnownSha === remoteFile.sha) {
            this.logger.debug(`File ${remoteFile.path} is already up to date.`);
            return;
        }

        const remoteContent = await this.githubApi.getFile(remoteFile.path);

        if (!(localFile instanceof TFile)) {
            // Local doesn't exist, create it
            this.logger.info(`Creating local file ${localPath}`);
            await this.createLocalFile(localPath, remoteContent.contentBase64);
        } else {
            // Local exists, check for modifications
            // For MVP: if local isn't dirty, we overwrite. If dirty, we trigger conflict.
            if (!this.dirtyFiles.has(localPath)) {
                this.logger.info(`Updating local file ${localPath}`);
                await this.updateLocalFile(localFile, remoteContent.contentBase64);
            } else {
                this.logger.warn(`Conflict detected for ${localPath}`);
                const localContent = await this.app.vault.read(localFile);
                const remoteContentStr = atob(remoteContent.contentBase64.replace(/\s/g, ""));
                await this.conflictResolver.resolvePullConflict({
                    path: localPath,
                    localContent: localContent,
                    remoteContent: remoteContentStr
                });
                this.statusBar.setStatus("conflict");
            }
        }

        this.metadataStore.updateSha(remoteFile.path, remoteContent.sha);
    }

    async pushOnShutdown(): Promise<void> {
        if (this.isPushing || this.dirtyFiles.size === 0) return;
        this.isPushing = true;
        this.statusBar.setStatus("pushing");
        this.logger.info(`Starting push of ${this.dirtyFiles.size} dirty files...`);

        try {
            for (const localPath of Array.from(this.dirtyFiles)) {
                await this.pushFile(localPath);
            }

            this.dirtyFiles.clear();
            await this.metadataStore.save();
            this.statusBar.setStatus("success");
            this.logger.info("Push completed successfully.");
        } catch (error: any) {
            this.statusBar.setStatus("error");
            this.logger.error("Failed during push", error);
        } finally {
            this.isPushing = false;
        }
    }

    private async pushFile(localPath: string): Promise<void> {
        const localFile = this.app.vault.getAbstractFileByPath(localPath);
        if (!(localFile instanceof TFile)) return;

        const remotePath = this.mapToRemotePath(localPath);
        const lastKnownSha = this.metadataStore.getSha(remotePath);
        
        const content = await this.app.vault.readBinary(localFile);
        const contentBase64 = this.arrayBufferToBase64(content);

        // Check remote SHA to avoid overwriting remote changes (conflict detection)
        const currentRemoteSha = await this.githubApi.getFileSha(remotePath);
        
        if (currentRemoteSha && currentRemoteSha !== lastKnownSha) {
            this.logger.warn(`Remote change detected for ${remotePath}. Aborting push to avoid overwrite.`);
            this.statusBar.setStatus("conflict");
            
            const localContent = await this.app.vault.read(localFile);
            const remoteFile = await this.githubApi.getFile(remotePath);
            const remoteContent = atob(remoteFile.contentBase64.replace(/\s/g, ""));
            
            await this.conflictResolver.resolvePushConflict({
                path: localPath,
                localContent: localContent,
                remoteContent: remoteContent
            });
            return;
        }

        await this.githubApi.createOrUpdateFile({
            path: remotePath,
            contentBase64: contentBase64,
            message: `Update ${localFile.name} from Obsidian`,
            sha: currentRemoteSha || undefined
        });

        // Update local metadata with new SHA
        const newSha = await this.githubApi.getFileSha(remotePath);
        if (newSha) {
            this.metadataStore.updateSha(remotePath, newSha);
        }
    }

    markDirty(path: string) {
        if (this.internalWritePaths.has(path)) return;
        if (this.pathFilter.shouldSync(path)) {
            this.dirtyFiles.add(path);
            this.logger.debug(`Marked ${path} as dirty`);
        }
    }

    private mapToLocalPath(remotePath: string): string {
        const relative = remotePath.substring(this.settings.repoPath.length).replace(/^\//, "");
        return normalizePath(this.settings.vaultSubPath + "/" + relative);
    }

    private mapToRemotePath(localPath: string): string {
        const relative = localPath.substring(this.settings.vaultSubPath.length).replace(/^\//, "");
        return (this.settings.repoPath + "/" + relative).replace(/^\//, "");
    }

    private async createLocalFile(path: string, contentBase64: string) {
        this.internalWritePaths.add(path);
        const buffer = this.base64ToArrayBuffer(contentBase64);
        
        // Ensure folder exists
        const folderPath = path.substring(0, path.lastIndexOf("/"));
        if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }
        
        await this.app.vault.createBinary(path, buffer);
        this.internalWritePaths.delete(path);
    }

    private async updateLocalFile(file: TFile, contentBase64: string) {
        this.internalWritePaths.add(file.path);
        const buffer = this.base64ToArrayBuffer(contentBase64);
        await this.app.vault.modifyBinary(file, buffer);
        this.internalWritePaths.delete(file.path);
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = "";
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = atob(base64.replace(/\s/g, ""));
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
