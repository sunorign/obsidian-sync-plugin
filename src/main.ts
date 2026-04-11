import { Plugin, Notice, TAbstractFile, TFile, Modal, App } from "obsidian";
import { GitHubSyncSettingTab } from "./settings";
import { PluginSettings, DEFAULT_SETTINGS, GitHubConfig, SyncHistoryEntry } from "./types";
import { GitHubApiClient } from "./github-api";
import { SyncManager } from "./sync-manager";
import { MetadataStore } from "./metadata-store";
import { HistoryStore } from "./history-store";
import { PathFilter } from "./path-filter";
import { Logger } from "./logger";
import { StatusBar } from "./status-bar";
import { ConflictResolver } from "./conflict-resolver";

export default class MyPlugin extends Plugin {
    settings!: PluginSettings;
    githubApi: GitHubApiClient | null = null;
    syncManager: SyncManager | null = null;
    metadataStore!: MetadataStore;
    historyStore!: HistoryStore;
    public pathFilter!: PathFilter;
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
        this.historyStore = new HistoryStore(this);
        this.pathFilter = new PathFilter(this.settings);
        this.conflictResolver = new ConflictResolver(this.app, this.logger);

        await this.metadataStore.load();
        await this.historyStore.load();
        this.historyStore.setMaxEntries(this.settings.maxSyncHistoryEntries);

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

        this.registerEvent(
            this.app.vault.on("delete", (file: TAbstractFile) => {
                if (file instanceof TFile && this.syncManager) {
                    this.syncManager.handleLocalDelete(file.path);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile && this.syncManager) {
                    this.syncManager.handleRename(oldPath, file.path);
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
                this.historyStore,
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

    async listBranches() {
        if (!this.githubApi) throw new Error("GitHub API not initialized");
        return await this.githubApi.listBranches();
    }

    async createBranch(branchName: string) {
        if (!this.githubApi) throw new Error("GitHub API not initialized");
        await this.githubApi.createBranch({
            branchName,
            baseBranch: this.settings.branch
        });
    }

    showSyncHistory(): void {
        new SyncHistoryModal(this.app, this.historyStore).open();
    }

    clearSyncHistory(): void {
        this.historyStore.clearHistory();
        new Notice("Sync history cleared");
    }

    showSyncSummary(): void {
        new SyncSummaryModal(this.app, this).open();
    }
}

class SyncSummaryModal extends Modal {
    private plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Sync Summary" });

        const syncManager = this.plugin.syncManager;
        const metadataStore = this.plugin.metadataStore;

        const summaryContainer = contentEl.createEl("div", { cls: "sync-summary" });
        summaryContainer.style.display = "grid";
        summaryContainer.style.gap = "16px";

        const currentBranch = this.plugin.settings.branch;
        this.addSummaryRow(summaryContainer, "Current Branch", currentBranch);

        const lastSyncAt = metadataStore.getLastSyncAt();
        if (lastSyncAt) {
            this.addSummaryRow(summaryContainer, "Last Sync", new Date(lastSyncAt).toLocaleString());
        } else {
            this.addSummaryRow(summaryContainer, "Last Sync", "Never synced");
        }

        const dirtyCount = syncManager ? syncManager.getDirtyFileCount() : 0;
        this.addSummaryRow(summaryContainer, "Pending Changes", `${dirtyCount} file${dirtyCount !== 1 ? 's' : ''} waiting to be pushed`);

        if (dirtyCount > 0 && syncManager) {
            const dirtyFiles = syncManager.getDirtyFiles();
            if (dirtyFiles.length > 0) {
                const filesContainer = summaryContainer.createEl("div");
                filesContainer.createEl("h4", { text: "Pending Files:" });
                const list = filesContainer.createEl("ul");
                list.style.paddingLeft = "20px";
                dirtyFiles.forEach(path => {
                    list.createEl("li", { text: path });
                });
            }
        }

        const trackedFiles = metadataStore.getAllShaEntries().length;
        this.addSummaryRow(summaryContainer, "Tracked Files", `${trackedFiles} files`);
    }

    private addSummaryRow(container: HTMLElement, label: string, value: string) {
        const row = container.createEl("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.borderBottom = "1px solid var(--background-modifier-border)";
        row.style.paddingBottom = "8px";

        const labelEl = row.createEl("span", { text: label + ":" });
        labelEl.style.fontWeight = "bold";
        const valueEl = row.createEl("span", { text: value });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SyncHistoryModal extends Modal {
    private historyStore: HistoryStore;

    constructor(app: App, historyStore: HistoryStore) {
        super(app);
        this.historyStore = historyStore;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Sync History" });

        const entries = this.historyStore.getEntries();
        if (entries.length === 0) {
            contentEl.createEl("p", { text: "No sync history entries yet." });
            return;
        }

        const table = contentEl.createEl("table", { cls: "sync-history-table" });
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";

        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        ["Time", "Operation", "File", "Status", "Message"].forEach(text => {
            const th = headerRow.createEl("th");
            th.textContent = text;
            th.style.borderBottom = "1px solid var(--background-modifier-border)";
            th.style.padding = "8px";
            th.style.textAlign = "left";
        });

        const tbody = table.createEl("tbody");
        entries.forEach(entry => {
            const row = tbody.createEl("tr");
            row.style.borderBottom = "1px solid var(--background-modifier-border)";

            const timeCell = row.createEl("td");
            timeCell.style.padding = "8px";
            timeCell.textContent = new Date(entry.timestamp).toLocaleString();

            const opCell = row.createEl("td");
            opCell.style.padding = "8px";
            opCell.textContent = entry.operationType;

            const fileCell = row.createEl("td");
            fileCell.style.padding = "8px";
            fileCell.textContent = entry.filePath || "-";

            const statusCell = row.createEl("td");
            statusCell.style.padding = "8px";
            statusCell.textContent = entry.status;
            statusCell.style.color = entry.status === 'success' ? 'var(--text-success)' : 
                                     entry.status === 'conflict' ? 'var(--text-warning)' : 
                                     'var(--text-error)';

            const msgCell = row.createEl("td");
            msgCell.style.padding = "8px";
            msgCell.textContent = entry.message;
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
