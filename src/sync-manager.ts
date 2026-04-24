import { App, TFile, TFolder, normalizePath, Notice } from "obsidian";
import { GitHubApiClient } from "./github-api";
import { PluginSettings, SyncStatus, RemoteFileMeta } from "./types";
import { MetadataStore } from "./metadata-store";
import { HistoryStore } from "./history-store";
import { PathFilter } from "./path-filter";
import { Logger } from "./logger";
import { StatusBar } from "./status-bar";
import { ConflictResolver } from "./conflict-resolver";
import { EMPTY_DIR_PLACEHOLDER, isEmptyDirPlaceholderPath } from "./constants";
import { t } from "./i18n";

export class SyncManager {
    private app: App;
    private githubApi: GitHubApiClient;
    private settings: PluginSettings;
    private metadataStore: MetadataStore;
    private historyStore: HistoryStore;
    private pathFilter: PathFilter;
    private logger: Logger;
    private statusBar: StatusBar;
    private conflictResolver: ConflictResolver;

    private dirtyFiles: Set<string> = new Set();
    private conflictedFiles: Set<string> = new Set();
    private failedFiles: Set<string> = new Set();
    private isPulling = false;
    private isPushing = false;
    private internalWritePaths: Set<string> = new Set();

    constructor(
        app: App,
        githubApi: GitHubApiClient,
        settings: PluginSettings,
        metadataStore: MetadataStore,
        historyStore: HistoryStore,
        pathFilter: PathFilter,
        logger: Logger,
        statusBar: StatusBar,
        conflictResolver: ConflictResolver
    ) {
        this.app = app;
        this.githubApi = githubApi;
        this.settings = settings;
        this.metadataStore = metadataStore;
        this.historyStore = historyStore;
        this.pathFilter = pathFilter;
        this.logger = logger;
        this.statusBar = statusBar;
        this.conflictResolver = conflictResolver;
    }

    async pullOnStartup(): Promise<void> {
        await this.pullRemoteChanges("initial pull");
    }

    async syncNow(): Promise<void> {
        const pullResult = await this.pullRemoteChanges("manual sync");

        if (pullResult.conflictCount > 0) {
            new Notice(this.translate("sync.notice.pullConflicts", { count: pullResult.conflictCount }));
            return;
        }

        if (pullResult.errorCount > 0) {
            new Notice(this.translate("sync.notice.pullErrors", { count: pullResult.errorCount }));
            return;
        }

        await this.pushOnShutdown(true);
    }

    async mirrorNow(): Promise<void> {
        await this.mirrorLocalToRemote();
    }

    private async pullRemoteChanges(trigger: "initial pull" | "manual sync"): Promise<{
        successCount: number;
        conflictCount: number;
        errorCount: number;
        deletedCount: number;
    }> {
        if (this.isPulling) {
            this.logger.warn(`Skipped ${trigger} because another pull is already running`);
            return { successCount: 0, conflictCount: 0, errorCount: 0, deletedCount: 0 };
        }
        this.isPulling = true;
        this.statusBar.setStatus("pulling");
        this.logger.info(`Starting ${trigger}...`);

        let successCount = 0;
        let conflictCount = 0;
        let errorCount = 0;
        let deletedCount = 0;

        try {
            const remoteFiles = await this.githubApi.listFiles(this.settings.repoPath);
            await this.ensureLocalEmptyFoldersFromRemote(
                remoteFiles
                    .filter(file => isEmptyDirPlaceholderPath(file.path))
                    .map(file => file.path)
            );
            const syncFiles = remoteFiles.filter(file =>
                !isEmptyDirPlaceholderPath(file.path) && this.pathFilter.shouldSync(file.path)
            );

            const remotePaths = new Set(syncFiles.map(f => f.path));
            const totalFiles = syncFiles.length;
            let processed = 0;

            for (const file of syncFiles) {
                processed++;
                if (totalFiles > 10 && processed % 10 === 0) {
                    new Notice(`Pulling... ${processed}/${totalFiles}`, 3000);
                }
                const result = await this.pullFile(file);
                if (result === 'success') successCount++;
                else if (result === 'conflict') conflictCount++;
                else if (result === 'error') errorCount++;
            }

            const deletedPaths = await this.cleanupLocalFiles(remotePaths);
            for (const path of deletedPaths) {
                this.logger.info(`Removing local file ${path} that no longer exists on remote`);
                deletedCount++;
            }

            this.metadataStore.updateLastSyncTime();
            await this.metadataStore.save();
            this.statusBar.setStatus(conflictCount > 0 ? "conflict" : errorCount > 0 ? "error" : "success");
            this.logger.info(`${trigger} completed: ${successCount} updated, ${deletedCount} deleted (remote removed), ${conflictCount} conflicts, ${errorCount} errors`);

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    'pull',
                    errorCount > 0 ? (conflictCount > 0 ? 'conflict' : 'error') : 'success',
                    `${trigger} completed: ${successCount} files updated, ${deletedCount} deleted (remote removed), ${conflictCount} conflicts, ${errorCount} errors`
                );
            }

            return { successCount, conflictCount, errorCount, deletedCount };
        } catch (error: any) {
            this.statusBar.setStatus("error");
            this.logger.error(`Failed during ${trigger}`, error);
            new Notice(this.translate("sync.notice.pullFailed", { message: error.message }));

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    'pull',
                    'error',
                    `${trigger} failed: ${error.message}`,
                    undefined,
                    error.message
                );
            }
            throw error;
        } finally {
            this.isPulling = false;
        }
    }

    private async pullFile(remoteFile: RemoteFileMeta): Promise<'success' | 'conflict' | 'error'> {
        const localPath = this.mapToLocalPath(remoteFile.path);
        const localFile = this.app.vault.getAbstractFileByPath(localPath);
        
        const lastKnownSha = this.metadataStore.getSha(remoteFile.path);
        if (lastKnownSha === remoteFile.sha) {
            this.logger.debug(`File ${remoteFile.path} is already up to date.`);
            return 'success';
        }

        try {
            const remoteContent = await this.githubApi.getFile(remoteFile.path);

            if (!(localFile instanceof TFile)) {
                this.logger.info(`Creating local file ${localPath}`);
                await this.createLocalFile(localPath, remoteContent.contentBase64);
            } else {
                if (!this.dirtyFiles.has(localPath)) {
                    this.logger.info(`Updating local file ${localPath}`);
                    await this.updateLocalFile(localFile, remoteContent.contentBase64);
                } else {
                    const localContentBase64 = this.arrayBufferToBase64(await this.app.vault.readBinary(localFile));
                    if (this.isEquivalentBase64(localContentBase64, remoteContent.contentBase64)) {
                        this.logger.info(`Skipping false conflict for ${localPath}; local and remote content are identical`);
                        this.metadataStore.updateSha(remoteFile.path, remoteFile.sha);
                        if (localPath.endsWith(".md")) {
                            this.metadataStore.updateBaseText(remoteFile.path, this.base64ToUtf8String(remoteContent.contentBase64));
                        }
                        this.dirtyFiles.delete(localPath);
                        this.conflictedFiles.delete(localPath);
                        this.failedFiles.delete(localPath);
                        return 'success';
                    }

                    this.logger.warn(`Conflict detected for ${localPath}`);
                    const localContent = await this.app.vault.read(localFile);
                    const remoteContentStr = this.base64ToUtf8String(remoteContent.contentBase64);
                    await this.conflictResolver.resolvePullConflict({
                        path: localPath,
                        localContent: localContent,
                        remoteContent: remoteContentStr,
                        baseContent: this.metadataStore.getBaseText(remoteFile.path)
                    });
                    this.conflictedFiles.add(localPath);
                    this.failedFiles.delete(localPath);
                    this.statusBar.setStatus("conflict");

                    if (this.settings.enableSyncHistory) {
                        this.historyStore.addEntry(
                            'pull',
                            'conflict',
                            `Conflict detected on pull`,
                            localPath
                        );
                    }
                    this.metadataStore.updateSha(remoteFile.path, remoteFile.sha);
                    return 'conflict';
                }
            }

            this.metadataStore.updateSha(remoteFile.path, remoteFile.sha);
            if (localPath.endsWith(".md")) {
                const baseText = this.base64ToUtf8String(remoteContent.contentBase64);
                this.metadataStore.updateBaseText(remoteFile.path, baseText);
            }
            this.conflictedFiles.delete(localPath);
            this.failedFiles.delete(localPath);
            return 'success';
        } catch (error: any) {
            this.failedFiles.add(localPath);
            this.logger.error(`Failed to pull file ${remoteFile.path}`, error);
            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    'pull',
                    'error',
                    `Failed to pull file`,
                    remoteFile.path,
                    error.message
                );
            }
            return 'error';
        }
    }

    async pushOnShutdown(includeEmptyFolders = false): Promise<void> {
        if (this.isPushing || (this.dirtyFiles.size === 0 && !includeEmptyFolders)) return;
        this.isPushing = true;
        this.statusBar.setStatus("pushing");
        this.logger.info(`Starting push of ${this.dirtyFiles.size} dirty files...`);

        const operationType = this.isAutoPush() ? 'auto-push' : 'push';

        let successCount = 0;
        let conflictCount = 0;
        let errorCount = 0;
        const successfullyPushedFiles: string[] = [];
        let mirroredEmptyFolderCount = 0;
        let removedEmptyFolderCount = 0;

        try {
            for (const localPath of Array.from(this.dirtyFiles)) {
                const result = await this.pushFile(localPath);
                if (result === 'success') {
                    successCount++;
                    successfullyPushedFiles.push(localPath);
                } else if (result === 'conflict') {
                    conflictCount++;
                } else if (result === 'error') {
                    errorCount++;
                }
            }

            for (const localPath of successfullyPushedFiles) {
                this.dirtyFiles.delete(localPath);
            }

            if (includeEmptyFolders) {
                const emptyFolderSyncResult = await this.syncEmptyFolderPlaceholders();
                mirroredEmptyFolderCount = emptyFolderSyncResult.uploadedCount;
                removedEmptyFolderCount = emptyFolderSyncResult.deletedCount;
                errorCount += emptyFolderSyncResult.errorCount;
            }

            await this.metadataStore.save();
            this.statusBar.setStatus(conflictCount > 0 ? "conflict" : errorCount > 0 ? "error" : "success");
            this.logger.info(
                `Push completed: ${successCount} pushed, ${mirroredEmptyFolderCount} empty folders mirrored, ${removedEmptyFolderCount} empty folders removed, ${conflictCount} conflicts, ${errorCount} errors, ${this.dirtyFiles.size} pending`
            );

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    operationType,
                    errorCount > 0 ? (conflictCount > 0 ? 'conflict' : 'error') : 'success',
                    `Push completed: ${successCount} files pushed, ${mirroredEmptyFolderCount} empty folders mirrored, ${removedEmptyFolderCount} empty folders removed, ${conflictCount} conflicts, ${errorCount} errors, ${this.dirtyFiles.size} still pending`
                );
            }

            if (conflictCount > 0 || errorCount > 0) {
                new Notice(this.translate("sync.notice.pending", {
                    success: successCount,
                    pending: this.dirtyFiles.size
                }));
            }
        } catch (error: any) {
            this.statusBar.setStatus("error");
            this.logger.error("Failed during push", error);

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    operationType,
                    'error',
                    `Push failed: ${error.message}`,
                    undefined,
                    error.message
                );
            }
        } finally {
            this.isPushing = false;
        }
    }

    private isAutoPush(): boolean {
        return this.settings.autoPushInterval > 0;
    }

    private async pushFile(localPath: string): Promise<'success' | 'conflict' | 'error'> {
        const localFile = this.app.vault.getAbstractFileByPath(localPath);
        if (!(localFile instanceof TFile)) {
            this.logger.warn(`Cannot push non-file ${localPath}`);
            return 'error';
        }

        try {
            const remotePath = this.mapToRemotePath(localPath);
            const lastKnownSha = this.metadataStore.getSha(remotePath);
            
            const content = await this.app.vault.readBinary(localFile);
            const contentBase64 = this.arrayBufferToBase64(content);

            const currentRemoteSha = await this.githubApi.getFileSha(remotePath);
            
            if (currentRemoteSha && currentRemoteSha !== lastKnownSha) {
                this.logger.warn(`Remote change detected for ${remotePath}. Aborting push to avoid overwrite.`);
                const remoteFile = await this.githubApi.getFile(remotePath);
                if (this.isEquivalentBase64(contentBase64, remoteFile.contentBase64)) {
                    this.logger.info(`Skipping false conflict for ${remotePath}; local and remote content are identical`);
                    this.metadataStore.updateSha(remotePath, currentRemoteSha);
                    if (localPath.endsWith(".md")) {
                        this.metadataStore.updateBaseText(remotePath, this.base64ToUtf8String(remoteFile.contentBase64));
                    }
                    this.conflictedFiles.delete(localPath);
                    this.failedFiles.delete(localPath);
                    return 'success';
                }

                this.statusBar.setStatus("conflict");
                
                const localContent = await this.app.vault.read(localFile);
                const remoteContent = this.base64ToUtf8String(remoteFile.contentBase64);
                
                await this.conflictResolver.resolvePushConflict({
                    path: localPath,
                    localContent: localContent,
                    remoteContent: remoteContent,
                    baseContent: this.metadataStore.getBaseText(remotePath)
                });
                this.metadataStore.updateSha(remotePath, currentRemoteSha);
                if (localPath.endsWith(".md")) {
                    this.metadataStore.updateBaseText(remotePath, remoteContent);
                }
                this.conflictedFiles.add(localPath);
                this.failedFiles.delete(localPath);

                if (this.settings.enableSyncHistory) {
                    this.historyStore.addEntry(
                        this.isAutoPush() ? 'auto-push' : 'push',
                        'conflict',
                        `Conflict detected on push`,
                        localPath
                    );
                }
                return 'conflict';
            }

            await this.githubApi.createOrUpdateFile({
                path: remotePath,
                contentBase64: contentBase64,
                message: `Update ${localFile.name} from Obsidian`,
                sha: currentRemoteSha || undefined
            });

            const newSha = await this.githubApi.getFileSha(remotePath);
            if (newSha) {
                this.metadataStore.updateSha(remotePath, newSha);
            }
            if (localPath.endsWith(".md")) {
                const latestText = await this.app.vault.read(localFile);
                this.metadataStore.updateBaseText(remotePath, latestText);
            }
            this.conflictedFiles.delete(localPath);
            this.failedFiles.delete(localPath);

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    this.isAutoPush() ? 'auto-push' : 'push',
                    'success',
                    `File pushed successfully`,
                    localPath
                );
            }
            return 'success';
        } catch (error: any) {
            this.failedFiles.add(localPath);
            this.logger.error(`Failed to push file ${localPath}`, error);
            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    this.isAutoPush() ? 'auto-push' : 'push',
                    'error',
                    `Failed to push file`,
                    localPath,
                    error.message
                );
            }
            return 'error';
        }
    }

    private async mirrorLocalToRemote(): Promise<void> {
        if (this.isPushing || this.isPulling) {
            new Notice(this.translate("sync.notice.busy"));
            return;
        }

        this.isPushing = true;
        this.statusBar.setStatus("pushing");
        this.logger.info("Starting manual mirror sync (local -> remote)...");

        let uploadedCount = 0;
        let deletedCount = 0;
        let errorCount = 0;
        let emptyFolderCount = 0;

        try {
            const localFiles = this.app.vault.getFiles().filter(file => this.pathFilter.shouldSync(file.path));
            const remoteFiles = await this.githubApi.listFiles(this.settings.repoPath);
            const emptyFolderRemotePaths = this.collectLocalEmptyFolderRemotePaths();

            const localByRemotePath = new Map<string, TFile>();
            const desiredRemotePaths = new Set<string>(emptyFolderRemotePaths);
            for (const file of localFiles) {
                const remotePath = this.mapToRemotePath(file.path);
                localByRemotePath.set(remotePath, file);
                desiredRemotePaths.add(remotePath);
            }

            for (const [remotePath, localFile] of localByRemotePath) {
                const result = await this.upsertMirrorFile(localFile, remotePath);
                if (result === "success") {
                    uploadedCount++;
                    this.dirtyFiles.delete(localFile.path);
                } else {
                    errorCount++;
                    this.failedFiles.add(localFile.path);
                }
            }

            for (const remotePath of emptyFolderRemotePaths) {
                const result = await this.upsertPlaceholderFile(remotePath);
                if (result === "success") {
                    emptyFolderCount++;
                } else {
                    errorCount++;
                }
            }

            for (const remoteFile of remoteFiles) {
                if (!isEmptyDirPlaceholderPath(remoteFile.path) && !this.pathFilter.shouldSync(remoteFile.path)) {
                    continue;
                }

                if (desiredRemotePaths.has(remoteFile.path)) {
                    continue;
                }

                const result = await this.deleteRemoteFileByPath(remoteFile.path);
                if (result === "success") {
                    deletedCount++;
                } else {
                    errorCount++;
                }
            }

            this.metadataStore.updateLastSyncTime();
            await this.metadataStore.save();
            this.statusBar.setStatus(errorCount > 0 ? "error" : "success");

            const summary = `Mirror sync completed: ${uploadedCount} uploaded, ${emptyFolderCount} empty folders mirrored, ${deletedCount} deleted, ${errorCount} errors`;
            this.logger.info(summary);

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    "push",
                    errorCount > 0 ? "error" : "success",
                    summary
                );
            }

            if (errorCount > 0) {
                new Notice(this.translate("sync.notice.mirrorErrors", { count: errorCount }));
            }
        } catch (error: any) {
            this.statusBar.setStatus("error");
            this.logger.error("Failed during manual mirror sync", error);
            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry("push", "error", `Mirror sync failed: ${error.message}`, undefined, error.message);
            }
            throw error;
        } finally {
            this.isPushing = false;
        }
    }

    private async upsertMirrorFile(localFile: TFile, remotePath: string): Promise<'success' | 'error'> {
        try {
            const currentRemoteSha = await this.githubApi.getFileSha(remotePath);
            const content = await this.app.vault.readBinary(localFile);
            const contentBase64 = this.arrayBufferToBase64(content);

            await this.githubApi.createOrUpdateFile({
                path: remotePath,
                contentBase64,
                message: `Mirror ${localFile.name} from Obsidian`,
                sha: currentRemoteSha || undefined
            });

            const newSha = await this.githubApi.getFileSha(remotePath);
            if (newSha) {
                this.metadataStore.updateSha(remotePath, newSha);
            }
            if (localFile.path.endsWith(".md")) {
                const text = await this.app.vault.read(localFile);
                this.metadataStore.updateBaseText(remotePath, text);
            }
            this.conflictedFiles.delete(localFile.path);
            this.failedFiles.delete(localFile.path);
            return "success";
        } catch (error: any) {
            this.logger.error(`Failed to mirror file ${localFile.path}`, error);
            return "error";
        }
    }

    private async upsertPlaceholderFile(remotePath: string): Promise<'success' | 'error'> {
        try {
            const currentRemoteSha = await this.githubApi.getFileSha(remotePath);
            const contentBase64 = btoa("This file preserves an empty folder for obsidian-github-sync.\n");

            await this.githubApi.createOrUpdateFile({
                path: remotePath,
                contentBase64,
                message: `Preserve empty folder ${remotePath}`,
                sha: currentRemoteSha || undefined
            });

            const newSha = await this.githubApi.getFileSha(remotePath);
            if (newSha) {
                this.metadataStore.updateSha(remotePath, newSha);
            }

            return "success";
        } catch (error: any) {
            this.logger.error(`Failed to mirror empty folder placeholder ${remotePath}`, error);
            return "error";
        }
    }

    private async deleteRemoteFileByPath(remotePath: string): Promise<'success' | 'error'> {
        try {
            const currentRemoteSha = await this.githubApi.getFileSha(remotePath);
            if (!currentRemoteSha) {
                this.metadataStore.removeSha(remotePath);
                return "success";
            }

            await this.githubApi.deleteFile({
                path: remotePath,
                message: `Mirror delete ${remotePath} from Obsidian`,
                sha: currentRemoteSha
            });

            this.metadataStore.removeSha(remotePath);
            return "success";
        } catch (error: any) {
            this.logger.error(`Failed to delete remote file ${remotePath} during mirror sync`, error);
            return "error";
        }
    }

    async deleteFile(localPath: string): Promise<'success' | 'error'> {
        const localFile = this.app.vault.getAbstractFileByPath(localPath);
        if (!(localFile instanceof TFile)) {
            return 'error';
        }

        try {
            const remotePath = this.mapToRemotePath(localPath);
            const currentRemoteSha = await this.githubApi.getFileSha(remotePath);
            
            if (!currentRemoteSha) {
                this.logger.debug(`Remote file ${remotePath} doesn't exist, no need to delete`);
                return 'success';
            }

            await this.githubApi.deleteFile({
                path: remotePath,
                message: `Delete ${localFile.name} from Obsidian`,
                sha: currentRemoteSha
            });

            this.metadataStore.removeSha(remotePath);
            await this.metadataStore.save();

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    'delete',
                    'success',
                    `File deleted from remote`,
                    localPath
                );
            }
            this.logger.info(`File ${localPath} deleted from remote`);
            return 'success';
        } catch (error: any) {
            this.logger.error(`Failed to delete file ${localPath} from remote`, error);
            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    'delete',
                    'error',
                    `Failed to delete file from remote`,
                    localPath,
                    error.message
                );
            }
            return 'error';
        }
    }

    markDirty(path: string) {
        if (this.internalWritePaths.has(path)) return;
        if (this.pathFilter.shouldSync(path)) {
            this.dirtyFiles.add(path);
            this.conflictedFiles.delete(path);
            this.failedFiles.delete(path);
            this.logger.debug(`Marked ${path} as dirty`);
        }
    }

    getDirtyFileCount(): number {
        return this.dirtyFiles.size;
    }

    getDirtyFiles(): string[] {
        return Array.from(this.dirtyFiles);
    }

    getConflictedFiles(): string[] {
        return Array.from(this.conflictedFiles);
    }

    getFailedFiles(): string[] {
        return Array.from(this.failedFiles);
    }

    async handleLocalDelete(localPath: string): Promise<void> {
        if (!this.pathFilter.shouldSync(localPath)) {
            return;
        }

        this.logger.info(`Handling local deletion: ${localPath}`);
        this.dirtyFiles.delete(localPath);
        this.conflictedFiles.delete(localPath);
        this.failedFiles.delete(localPath);
        await this.deleteFile(localPath);
    }

    async handleRename(oldLocalPath: string, newLocalPath: string): Promise<void> {
        if (!this.pathFilter.shouldSync(oldLocalPath) && !this.pathFilter.shouldSync(newLocalPath)) {
            return;
        }

        this.logger.info(`Handling rename: ${oldLocalPath} -> ${newLocalPath}`);

        this.dirtyFiles.delete(oldLocalPath);
        this.conflictedFiles.delete(oldLocalPath);
        this.failedFiles.delete(oldLocalPath);

        if (this.pathFilter.shouldSync(newLocalPath)) {
            this.dirtyFiles.add(newLocalPath);
        }

        const oldRemotePath = this.mapToRemotePath(oldLocalPath);
        const currentRemoteSha = await this.githubApi.getFileSha(oldRemotePath);

        if (!currentRemoteSha) {
            this.logger.debug(`Remote file ${oldRemotePath} doesn't exist, no need to delete`);
            return;
        }

        try {
            await this.githubApi.deleteFile({
                path: oldRemotePath,
                message: `Rename ${oldLocalPath} to ${newLocalPath}`,
                sha: currentRemoteSha
            });

            this.metadataStore.removeSha(oldRemotePath);

            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    'rename',
                    'success',
                    `File renamed: ${oldLocalPath} -> ${newLocalPath}`,
                    newLocalPath
                );
            }

            this.logger.info(`Successfully deleted old remote file after rename: ${oldRemotePath}`);
        } catch (error: any) {
            this.logger.error(`Failed to delete old remote file after rename: ${oldRemotePath}`, error);
            if (this.settings.enableSyncHistory) {
                this.historyStore.addEntry(
                    'rename',
                    'error',
                    `Failed to delete old remote file after rename`,
                    oldLocalPath,
                    error.message
                );
            }
        }
    }

    private async cleanupLocalFiles(remotePaths: Set<string>): Promise<string[]> {
        const deletedPaths: string[] = [];
        const existingRemoteShas = this.metadataStore.getAllShaEntries();

        for (const [remotePath, _sha] of existingRemoteShas) {
            if (!remotePaths.has(remotePath) && !isEmptyDirPlaceholderPath(remotePath) && this.pathFilter.shouldSync(remotePath)) {
                const localPath = this.mapToLocalPath(remotePath);
                const localFile = this.app.vault.getAbstractFileByPath(localPath);

                if (localFile instanceof TFile) {
                    try {
                        this.internalWritePaths.add(localPath);
                        await this.app.vault.delete(localFile);
                        this.internalWritePaths.delete(localPath);
                        this.metadataStore.removeSha(remotePath);
                        deletedPaths.push(localPath);

                        if (this.settings.enableSyncHistory) {
                            this.historyStore.addEntry(
                                'pull',
                                'success',
                                `Removed local file that no longer exists on remote`,
                                localPath
                            );
                        }
                    } catch (error) {
                        this.logger.error(`Failed to delete local file ${localPath}`, error);
                    }
                }
            }
        }

        return deletedPaths;
    }

    private async syncEmptyFolderPlaceholders(): Promise<{ uploadedCount: number; deletedCount: number; errorCount: number }> {
        const remoteFiles = await this.githubApi.listFiles(this.settings.repoPath);
        const desiredRemotePaths = new Set(this.collectLocalEmptyFolderRemotePaths());
        const existingPlaceholderPaths = new Set(
            remoteFiles
                .filter(file => isEmptyDirPlaceholderPath(file.path))
                .map(file => file.path)
        );

        let uploadedCount = 0;
        let deletedCount = 0;
        let errorCount = 0;

        for (const remotePath of desiredRemotePaths) {
            if (existingPlaceholderPaths.has(remotePath)) {
                continue;
            }

            const result = await this.upsertPlaceholderFile(remotePath);
            if (result === "success") {
                uploadedCount++;
            } else {
                errorCount++;
            }
        }

        for (const remotePath of existingPlaceholderPaths) {
            if (desiredRemotePaths.has(remotePath)) {
                continue;
            }

            const result = await this.deleteRemoteFileByPath(remotePath);
            if (result === "success") {
                deletedCount++;
            } else {
                errorCount++;
            }
        }

        return { uploadedCount, deletedCount, errorCount };
    }

    private mapToLocalPath(remotePath: string): string {
        const relative = remotePath.substring(this.settings.repoPath.length).replace(/^\//, "");
        return normalizePath(this.settings.vaultSubPath + "/" + relative);
    }

    private mapToRemotePath(localPath: string): string {
        const relative = localPath.substring(this.settings.vaultSubPath.length).replace(/^\//, "");
        return (this.settings.repoPath + "/" + relative).replace(/^\//, "");
    }

    private collectLocalEmptyFolderRemotePaths(): string[] {
        const syncRootPath = normalizePath(this.settings.vaultSubPath || "");
        const rootFolder = syncRootPath === ""
            ? this.app.vault.getRoot()
            : this.app.vault.getAbstractFileByPath(syncRootPath);

        if (!(rootFolder instanceof TFolder)) {
            return [];
        }

        const allLoadedFiles = this.app.vault.getAllLoadedFiles();
        const byPath = new Map(allLoadedFiles.map((file) => [file.path, file]));
        const childrenByParent = new Map<string, string[]>();

        allLoadedFiles.forEach((file) => {
            if (file.path === "") {
                return;
            }

            const parentPath = file.parent?.path ?? "";
            const siblings = childrenByParent.get(parentPath) ?? [];
            siblings.push(file.path);
            childrenByParent.set(parentPath, siblings);
        });

        const placeholderPaths: string[] = [];

        const visitFolder = (folder: TFolder): boolean => {
            let represented = false;
            const childPaths = childrenByParent.get(folder.path) ?? [];

            for (const childPath of childPaths) {
                const child = byPath.get(childPath);
                if (!child) {
                    continue;
                }

                if (child instanceof TFile) {
                    if (this.pathFilter.shouldSync(child.path)) {
                        represented = true;
                    }
                    continue;
                }

                if (child instanceof TFolder && visitFolder(child)) {
                    represented = true;
                }
            }

            if (!represented && folder.path !== syncRootPath) {
                placeholderPaths.push(normalizePath(`${this.mapToRemotePath(folder.path)}/${EMPTY_DIR_PLACEHOLDER}`));
                return true;
            }

            return represented;
        };

        visitFolder(rootFolder);
        return placeholderPaths;
    }

    private async ensureLocalEmptyFoldersFromRemote(remotePlaceholderPaths: string[]): Promise<void> {
        for (const remotePath of remotePlaceholderPaths) {
            const localFolderPath = this.mapPlaceholderToLocalFolder(remotePath);
            if (!localFolderPath || this.app.vault.getAbstractFileByPath(localFolderPath)) {
                continue;
            }

            this.internalWritePaths.add(localFolderPath);
            try {
                await this.app.vault.createFolder(localFolderPath);
            } finally {
                this.internalWritePaths.delete(localFolderPath);
            }
        }
    }

    private mapPlaceholderToLocalFolder(remotePlaceholderPath: string): string {
        const suffix = `/${EMPTY_DIR_PLACEHOLDER}`;
        const remoteFolderPath = remotePlaceholderPath.endsWith(suffix)
            ? remotePlaceholderPath.slice(0, -suffix.length)
            : "";
        return this.mapToLocalPath(remoteFolderPath);
    }

    private translate(key: Parameters<typeof t>[1], vars?: Record<string, string | number>): string {
        return t(this.settings, key, vars);
    }

    private async createLocalFile(path: string, contentBase64: string) {
        this.internalWritePaths.add(path);
        const buffer = this.base64ToArrayBuffer(contentBase64);
        
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

    private base64ToUtf8String(base64: string): string {
        const buffer = this.base64ToArrayBuffer(base64);
        return new TextDecoder("utf-8").decode(new Uint8Array(buffer));
    }

    private isEquivalentBase64(leftBase64: string, rightBase64: string): boolean {
        return leftBase64.replace(/\s/g, "") === rightBase64.replace(/\s/g, "");
    }
}
