import { Plugin, Notice, TAbstractFile, TFile } from "obsidian";
import { GitHubSyncSettingTab } from "./settings";
import { PluginSettings, DEFAULT_SETTINGS, GitHubConfig } from "./types";
import { GitHubApiClient } from "./github-api";
import { SyncManager } from "./sync-manager";
import { MetadataStore } from "./metadata-store";
import { PathFilter } from "./path-filter";
import { Logger } from "./logger";
import { StatusBar } from "./status-bar";
import { ConflictResolver } from "./conflict-resolver";

export default class MyPlugin extends Plugin {
    settings!: PluginSettings;
    githubApi: GitHubApiClient | null = null;
    syncManager: SyncManager | null = null;
    metadataStore!: MetadataStore;
    pathFilter!: PathFilter;
    logger!: Logger;
    statusBar!: StatusBar;
    conflictResolver!: ConflictResolver;

    private tokenKey = "github-token";
    private autoPushTimer: number | null = null;

    async onload() {
        await this.loadSettings();

        // Initialize core components
        this.logger = new Logger();
        this.statusBar = new StatusBar(this.addStatusBarItem());
        this.metadataStore = new MetadataStore(this);
        this.pathFilter = new PathFilter(this.settings);
        this.conflictResolver = new ConflictResolver(this.app, this.logger);

        await this.metadataStore.load();

        // Add settings tab
        this.addSettingTab(new GitHubSyncSettingTab(this.app, this));

        // Initialize GitHub API and SyncManager if token exists
        const token = await this.loadToken();
        if (token) {
            this.initializeSync(token);
            
            // Initial pull
            if (this.settings.autoPullOnStartup) {
                // Use setTimeout to avoid blocking the main thread during startup
                setTimeout(() => {
                    this.syncManager?.pullOnStartup();
                }, 1000);
            }
        }

        // Register file events
        this.registerEvent(
            this.app.vault.on("modify", (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    this.syncManager?.markDirty(file.path);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("create", (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    this.syncManager?.markDirty(file.path);
                }
            })
        );

        this.logger.info("GitHub Sync plugin loaded");

        // Start auto-push timer if enabled
        this.startAutoPushTimer();
    }

    async onunload() {
        // Stop auto-push timer
        this.stopAutoPushTimer();

        if (this.settings.autoPushOnShutdown && this.syncManager) {
            await this.syncManager.pushOnShutdown();
        }
        this.logger.info("GitHub Sync plugin unloaded");
    }

    startAutoPushTimer() {
        this.stopAutoPushTimer();
        
        if (this.settings.autoPushInterval <= 0 || !this.syncManager) {
            return;
        }

        // Convert minutes to milliseconds
        const intervalMs = this.settings.autoPushInterval * 60 * 1000;
        
        // @ts-ignore
        this.autoPushTimer = window.setInterval(() => {
            this.logger.info(`Auto-push triggered by interval (${this.settings.autoPushInterval} minutes)`);
            this.syncManager?.pushOnShutdown();
        }, intervalMs);

        this.logger.info(`Auto-push timer started: every ${this.settings.autoPushInterval} minutes`);
    }

    stopAutoPushTimer() {
        if (this.autoPushTimer !== null) {
            // @ts-ignore
            window.clearInterval(this.autoPushTimer);
            this.autoPushTimer = null;
            this.logger.info("Auto-push timer stopped");
        }
    }

    restartAutoPushTimer() {
        this.stopAutoPushTimer();
        this.startAutoPushTimer();
    }

    async syncNow(): Promise<void> {
        if (!this.syncManager) {
            throw new Error("Sync manager not initialized");
        }

        if (!this.githubApi) {
            throw new Error("GitHub API not initialized");
        }

        await this.syncManager.pushOnShutdown();
    }

    private initializeSync(token: string) {
        this.initializeGitHubApi(token);
        if (this.githubApi) {
            this.syncManager = new SyncManager(
                this.app,
                this.githubApi,
                this.settings,
                this.metadataStore,
                this.pathFilter,
                this.logger,
                this.statusBar,
                this.conflictResolver
            );

            // Restart auto-push timer after reinitialization
            this.restartAutoPushTimer();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update path filter if settings change
        if (this.pathFilter) {
            this.pathFilter = new PathFilter(this.settings);
        }
    }

    async saveToken(token: string) {
        try {
            // @ts-ignore
            if (this.app.keychain) {
                // @ts-ignore
                await this.app.keychain.set(this.tokenKey, token);
            } else {
                const dirPath = `.obsidian/plugins/${this.manifest.id}`;
                const filePath = `${dirPath}/.token`;
                // Ensure directory exists
                if (!(await this.app.vault.adapter.exists(dirPath))) {
                    await this.app.vault.adapter.mkdir(dirPath);
                }
                await this.app.vault.adapter.write(filePath, token);
            }
        } catch (e) {
            console.error("Failed to save token to keychain, trying fallback", e);
            const dirPath = `.obsidian/plugins/${this.manifest.id}`;
            const filePath = `${dirPath}/.token`;
            // Ensure directory exists
            if (!(await this.app.vault.adapter.exists(dirPath))) {
                await this.app.vault.adapter.mkdir(dirPath);
            }
            await this.app.vault.adapter.write(filePath, token);
        }
        
        this.initializeSync(token);
    }

    async loadToken(): Promise<string | null> {
        try {
            // @ts-ignore
            if (this.app.keychain) {
                // @ts-ignore
                return await this.app.keychain.get(this.tokenKey);
            } else {
                const path = `.obsidian/plugins/${this.manifest.id}/.token`;
                if (await this.app.vault.adapter.exists(path)) {
                    return await this.app.vault.adapter.read(path);
                }
            }
        } catch (e) {
            console.error("Failed to load token", e);
        }
        return null;
    }

    async deleteToken(): Promise<void> {
        try {
            // @ts-ignore
            if (this.app.keychain) {
                // @ts-ignore
                await this.app.keychain.remove(this.tokenKey);
            } else {
                const path = `.obsidian/plugins/${this.manifest.id}/.token`;
                if (await this.app.vault.adapter.exists(path)) {
                    await this.app.vault.adapter.remove(path);
                }
            }
        } catch (e) {
            console.error("Failed to delete token", e);
        }
        
        // Stop auto-push timer
        this.stopAutoPushTimer();
        
        // Clear GitHub API client
        this.githubApi = null;
        this.syncManager = null;
    }

    initializeGitHubApi(token: string) {
        const config: GitHubConfig = {
            owner: this.settings.owner,
            repo: this.settings.repo,
            branch: this.settings.branch,
            token: token,
            timeout: this.settings.requestTimeoutMs,
        };
        this.githubApi = new GitHubApiClient(config);
    }

    async testConnection() {
        const token = await this.loadToken();
        if (!token) throw new Error("No GitHub token found");
        
        this.initializeGitHubApi(token);
        if (!this.githubApi) throw new Error("Failed to initialize GitHub API");
        
        await this.githubApi.validateAccess();
    }
}
