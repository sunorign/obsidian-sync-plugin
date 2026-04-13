import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import MyPlugin from "./main";
import { PathFilter } from "./path-filter";
import { DEFAULT_SETTINGS } from "./types";

export class GitHubSyncSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private _newBranchName: string = "";

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", { text: "GitHub Sync Settings" });

        new Setting(containerEl)
            .setName("GitHub Token")
            .setDesc("GitHub Personal Access Token (Fine-grained PAT recommended)")
            .addText(async (text) => {
                const currentToken = await this.plugin.loadToken();
                text
                    .setPlaceholder("github_pat_...")
                    .setValue(currentToken || "")
                    .onChange(async (value) => {
                        if (value) {
                            await this.plugin.saveToken(value);
                            new Notice("Token saved securely");
                        }
                    });
            })
            .addButton((button) =>
                button.setButtonText("Save Token").onClick(async () => {
                    new Notice("Token saved");
                })
            )
            .addButton((button) =>
                button.setButtonText("Test Connection").onClick(async () => {
                    try {
                        await this.plugin.testConnection();
                        new Notice("GitHub connection successful!");
                    } catch (error: any) {
                        new Notice(`Connection failed: ${error.message}`);
                    }
                })
            )
            .addButton((button) =>
                button.setButtonText("Delete Token").onClick(async () => {
                    await this.plugin.deleteToken();
                    new Notice("Token deleted");
                    // Refresh the display
                    this.display();
                })
            );

        new Setting(containerEl)
            .setName("GitHub Owner")
            .setDesc("The owner of the repository (user or organization)")
            .addText((text) =>
                text
                    .setPlaceholder("username")
                    .setValue(this.plugin.settings.owner)
                    .onChange(async (value) => {
                        this.plugin.settings.owner = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("GitHub Repo")
            .setDesc("The name of the repository")
            .addText((text) =>
                text
                    .setPlaceholder("my-notes")
                    .setValue(this.plugin.settings.repo)
                    .onChange(async (value) => {
                        this.plugin.settings.repo = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Branch")
            .setDesc("The branch to sync with (default: main)")
            .addText((text) =>
                text
                    .setPlaceholder("main")
                    .setValue(this.plugin.settings.branch)
                    .onChange(async (value) => {
                        this.plugin.settings.branch = value || "main";
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Remote Path")
            .setDesc("The path in the repository to sync (empty for root)")
            .addText((text) =>
                text
                    .setPlaceholder("notes")
                    .setValue(this.plugin.settings.repoPath)
                    .onChange(async (value) => {
                        this.plugin.settings.repoPath = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Local Path")
            .setDesc("The sub-path in your Vault to sync (empty for root)")
            .addText((text) =>
                text
                    .setPlaceholder("GitHubSync")
                    .setValue(this.plugin.settings.vaultSubPath)
                    .onChange(async (value) => {
                        this.plugin.settings.vaultSubPath = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Auto Pull on Startup")
            .setDesc("Automatically pull changes from GitHub when Obsidian starts")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoPullOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.autoPullOnStartup = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Auto Push on Shutdown")
            .setDesc("Automatically push local changes to GitHub when Obsidian closes")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoPushOnShutdown)
                    .onChange(async (value) => {
                        this.plugin.settings.autoPushOnShutdown = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Sync Markdown Only")
            .setDesc("Only sync .md files (recommended for MVP)")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncMarkdownOnly)
                    .onChange(async (value) => {
                        this.plugin.settings.syncMarkdownOnly = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Sync Image Files")
            .setDesc("Sync image files: .png, .jpg, .jpeg, .gif, .webp, .svg")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncImages)
                    .onChange(async (value) => {
                        this.plugin.settings.syncImages = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Sync PDF Files")
            .setDesc("Sync PDF files (.pdf)")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncPDF)
                    .onChange(async (value) => {
                        this.plugin.settings.syncPDF = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Auto Push Interval (minutes)")
            .setDesc("Automatically push changes every X minutes (0 = disabled)")
            .addText((text) =>
                text
                    .setPlaceholder("0")
                    .setValue(this.plugin.settings.autoPushInterval.toString())
                    .onChange(async (value) => {
                        const interval = parseInt(value);
                        this.plugin.settings.autoPushInterval = !isNaN(interval) && interval >= 0 ? interval : 0;
                        await this.plugin.saveSettings();
                        this.plugin.restartAutoPushTimer();
                    })
            );

        new Setting(containerEl)
            .setName("Manual Sync")
            .setDesc("Pull remote changes first, then push local changes if no conflicts are found")
            .addButton((button) =>
                button.setButtonText("Sync Now").onClick(async () => {
                    try {
                        new Notice("Starting sync...");
                        await this.plugin.syncNow();
                        new Notice("Sync completed!");
                    } catch (error: any) {
                        new Notice(`Sync failed: ${error.message}`);
                    }
                })
            );

        containerEl.createEl("hr");
        containerEl.createEl("h3", { text: "Exclusion Patterns" });

        new Setting(containerEl)
            .setName("Exclude Patterns")
            .setDesc("One pattern per line. Supports glob patterns (e.g., *.tmp, **/.git/**)")
            .addTextArea((text) => {
                text
                    .setPlaceholder("*.tmp\n**/.git/**\n**/*.log")
                    .setValue(this.plugin.settings.excludePatterns.join("\n"))
                    .onChange(async (value) => {
                        this.plugin.settings.excludePatterns = value.split("\n").map(p => p.trim()).filter(p => p.length > 0);
                        await this.plugin.saveSettings();
                        if (this.plugin.pathFilter) {
                            this.plugin.pathFilter = new PathFilter(this.plugin.settings);
                        }
                    });
            });

        containerEl.createEl("hr");
        containerEl.createEl("h3", { text: "Branch Management" });

        new Setting(containerEl)
            .setName("Current Branch")
            .setDesc(`Current branch: ${this.plugin.settings.branch || 'main'}`)
            .addButton((button) =>
                button.setButtonText("Load Branches").onClick(async () => {
                    try {
                        new Notice("Loading branches...");
                        const branches = await this.plugin.listBranches();
                        this.showBranchList(branches);
                    } catch (error: any) {
                        new Notice(`Failed to load branches: ${error.message}`);
                    }
                })
            );

        new Setting(containerEl)
            .setName("Create New Branch")
            .setDesc("Create a new branch from current branch")
            .addText((text) =>
                text
                    .setPlaceholder("new-branch-name")
                    .onChange(async (value) => {
                        this._newBranchName = value.trim();
                    })
            )
            .addButton((button) =>
                button.setButtonText("Create").onClick(async () => {
                    if (!this._newBranchName) {
                        new Notice("Please enter a branch name");
                        return;
                    }
                    try {
                        await this.plugin.createBranch(this._newBranchName);
                        new Notice(`Branch ${this._newBranchName} created successfully`);
                        this.display();
                    } catch (error: any) {
                        new Notice(`Failed to create branch: ${error.message}`);
                    }
                })
            );

        containerEl.createEl("hr");
        containerEl.createEl("h3", { text: "Sync Summary" });

        new Setting(containerEl)
            .setName("Sync Summary")
            .setDesc("Show current sync status, last sync time and pending changes")
            .addButton((button) =>
                button.setButtonText("View Summary").onClick(() => {
                    this.plugin.showSyncSummary();
                })
            );

        containerEl.createEl("hr");
        containerEl.createEl("h3", { text: "Sync History" });

        new Setting(containerEl)
            .setName("Enable Sync History")
            .setDesc("Log all sync operations for troubleshooting")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableSyncHistory)
                    .onChange(async (value) => {
                        this.plugin.settings.enableSyncHistory = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Max History Entries")
            .setDesc("Maximum number of history entries to keep (default: 100)")
            .addText((text) =>
                text
                    .setPlaceholder("100")
                    .setValue(this.plugin.settings.maxSyncHistoryEntries.toString())
                    .onChange(async (value) => {
                        const max = parseInt(value);
                        this.plugin.settings.maxSyncHistoryEntries = !isNaN(max) && max > 0 ? max : 100;
                        await this.plugin.saveSettings();
                        if (this.plugin.historyStore) {
                            this.plugin.historyStore.setMaxEntries(this.plugin.settings.maxSyncHistoryEntries);
                        }
                    })
            );

        new Setting(containerEl)
            .setName("View History")
            .setDesc("View recent sync operations and their results")
            .addButton((button) =>
                button.setButtonText("View History").onClick(() => {
                    this.plugin.showSyncHistory();
                })
            )
            .addButton((button) =>
                button.setButtonText("Clear History").onClick(async () => {
                    this.plugin.clearSyncHistory();
                })
            );
    }

    private showBranchList(branches: Array<{name: string, isDefault: boolean, protected: boolean}>) {
        const modal = new BranchListModal(this.app, this.plugin, branches, (selectedBranch: string) => {
            this.plugin.settings.branch = selectedBranch;
            this.plugin.saveSettings().then(() => {
                new Notice(`Switched to branch: ${selectedBranch}`);
                if (this.plugin.githubApi) {
                    this.plugin.githubApi.updateCurrentBranch(selectedBranch);
                }
                this.display();
            });
        });
        modal.open();
    }
}

class BranchListModal extends Modal {
    private plugin: MyPlugin;
    private branches: Array<{name: string, isDefault: boolean, protected: boolean}>;
    private onSelect: (branch: string) => void;

    constructor(
        app: App,
        plugin: MyPlugin,
        branches: Array<{name: string, isDefault: boolean, protected: boolean}>,
        onSelect: (branch: string) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.branches = branches;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Select Branch" });

        const currentBranch = this.plugin.settings.branch;

        this.branches.forEach(branch => {
            const container = contentEl.createEl("div", { cls: "branch-item" });
            container.style.padding = "8px";
            container.style.margin = "4px 0";
            container.style.border = "1px solid var(--background-modifier-border)";
            container.style.borderRadius = "4px";

            if (branch.name === currentBranch) {
                container.style.backgroundColor = "var(--interactive-accent)";
                container.style.color = "var(--text-on-accent)";
            }

            container.onclick = async () => {
                this.onSelect(branch.name);
                this.close();
            };

            const nameSpan = container.createEl("span", { text: branch.name });
            nameSpan.style.fontWeight = branch.isDefault ? "bold" : "normal";

            if (branch.isDefault) {
                const badge = container.createEl("span", { text: " (default)" });
                badge.style.fontSize = "0.8em";
                badge.style.marginLeft = "8px";
                badge.style.opacity = "0.8";
            }

            if (branch.protected) {
                const badge = container.createEl("span", { text: " 🔒" });
                badge.title = "Protected branch";
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
