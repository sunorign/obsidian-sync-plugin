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
    }

    async onunload() {
        if (this.settings.autoPushOnShutdown && this.syncManager) {
            await this.syncManager.pushOnShutdown();
        }
        this.logger.info("GitHub Sync plugin unloaded");
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
                const path = `.obsidian/plugins/${this.manifest.id}/.token`;
                await this.app.vault.adapter.write(path, token);
            }
        } catch (e) {
            console.error("Failed to save token", e);
            const path = `.obsidian/plugins/${this.manifest.id}/.token`;
            await this.app.vault.adapter.write(path, token);
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
