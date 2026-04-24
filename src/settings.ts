import { App, Notice, Modal, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import { PathFilter } from "./path-filter";

export class GitHubSyncSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private newBranchName = "";

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        const t = this.plugin.t.bind(this.plugin);

        containerEl.empty();
        containerEl.createEl("h2", { text: t("settings.title") });

        new Setting(containerEl)
            .setName(t("settings.language.name"))
            .setDesc(t("settings.language.desc"))
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("zh-CN", t("settings.language.zh"))
                    .addOption("en", t("settings.language.en"))
                    .setValue(this.plugin.settings.language)
                    .onChange(async (value) => {
                        this.plugin.settings.language = value === "en" ? "en" : "zh-CN";
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        containerEl.createEl("h3", { text: t("settings.core") });

        new Setting(containerEl)
            .setName(t("settings.token.name"))
            .setDesc(t("settings.token.desc"))
            .addText(async (text) => {
                const currentToken = await this.plugin.loadToken();
                text
                    .setPlaceholder(t("settings.token.placeholder"))
                    .setValue(currentToken || "")
                    .onChange(async (value) => {
                        if (value) {
                            await this.plugin.saveToken(value);
                            new Notice(t("settings.token.savedSecurely"));
                        }
                    });
            })
            .addButton((button) =>
                button.setButtonText(t("settings.token.saveButton")).onClick(() => {
                    new Notice(t("settings.token.saved"));
                })
            )
            .addButton((button) =>
                button.setButtonText(t("settings.token.testButton")).onClick(async () => {
                    try {
                        await this.plugin.testConnection();
                        new Notice(t("settings.token.testSuccess"));
                    } catch (error: any) {
                        new Notice(t("notice.connection.failed", { message: error.message }));
                    }
                })
            )
            .addButton((button) =>
                button.setButtonText(t("settings.token.deleteButton")).onClick(async () => {
                    await this.plugin.deleteToken();
                    new Notice(t("settings.token.deleted"));
                    this.display();
                })
            );

        new Setting(containerEl)
            .setName(t("settings.owner.name"))
            .setDesc(t("settings.owner.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.owner.placeholder"))
                    .setValue(this.plugin.settings.owner)
                    .onChange(async (value) => {
                        this.plugin.settings.owner = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("settings.repo.name"))
            .setDesc(t("settings.repo.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.repo.placeholder"))
                    .setValue(this.plugin.settings.repo)
                    .onChange(async (value) => {
                        this.plugin.settings.repo = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("settings.branch.name"))
            .setDesc(t("settings.branch.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.branch.placeholder"))
                    .setValue(this.plugin.settings.branch)
                    .onChange(async (value) => {
                        this.plugin.settings.branch = value || "main";
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("settings.remotePath.name"))
            .setDesc(t("settings.remotePath.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.remotePath.placeholder"))
                    .setValue(this.plugin.settings.repoPath)
                    .onChange(async (value) => {
                        this.plugin.settings.repoPath = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("settings.localPath.name"))
            .setDesc(t("settings.localPath.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.localPath.placeholder"))
                    .setValue(this.plugin.settings.vaultSubPath)
                    .onChange(async (value) => {
                        this.plugin.settings.vaultSubPath = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("settings.autoPull.name"))
            .setDesc(t("settings.autoPull.desc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoPullOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.autoPullOnStartup = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("settings.autoPushInterval.name"))
            .setDesc(t("settings.autoPushInterval.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.autoPushInterval.placeholder"))
                    .setValue(String(this.plugin.settings.autoPushInterval))
                    .onChange(async (value) => {
                        const interval = Number.parseInt(value, 10);
                        this.plugin.settings.autoPushInterval = Number.isNaN(interval) || interval < 0 ? 0 : interval;
                        await this.plugin.saveSettings();
                        this.plugin.restartAutoPushTimer();
                    })
            );

        new Setting(containerEl)
            .setName(t("settings.syncNow.name"))
            .setDesc(t("settings.syncNow.desc"))
            .addButton((button) =>
                button.setCta().setButtonText(t("settings.syncNow.button")).onClick(async () => {
                    try {
                        new Notice(t("notice.sync.start"));
                        await this.plugin.syncNow();
                        new Notice(t("notice.sync.done"));
                    } catch (error: any) {
                        new Notice(t("notice.sync.failed", { message: error.message }));
                    }
                })
            );

        new Setting(containerEl)
            .setName(t("settings.mirror.name"))
            .setDesc(t("settings.mirror.desc"))
            .addButton((button) =>
                button.setButtonText(t("settings.mirror.button")).onClick(async () => {
                    try {
                        new Notice(t("notice.mirror.start"));
                        await this.plugin.mirrorLocalToGitHub();
                        new Notice(t("notice.mirror.done"));
                    } catch (error: any) {
                        new Notice(t("notice.mirror.failed", { message: error.message }));
                    }
                })
            );

        const advancedDetails = containerEl.createEl("details", { cls: "github-sync-advanced-settings" });
        advancedDetails.createEl("summary", { text: t("settings.advanced") });
        const advancedBody = advancedDetails.createDiv();

        new Setting(advancedBody)
            .setName(t("settings.autoPushOnShutdown.name"))
            .setDesc(t("settings.autoPushOnShutdown.desc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoPushOnShutdown)
                    .onChange(async (value) => {
                        this.plugin.settings.autoPushOnShutdown = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(advancedBody)
            .setName(t("settings.syncMarkdownOnly.name"))
            .setDesc(t("settings.syncMarkdownOnly.desc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncMarkdownOnly)
                    .onChange(async (value) => {
                        this.plugin.settings.syncMarkdownOnly = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(advancedBody)
            .setName(t("settings.syncImages.name"))
            .setDesc(t("settings.syncImages.desc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncImages)
                    .onChange(async (value) => {
                        this.plugin.settings.syncImages = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(advancedBody)
            .setName(t("settings.syncPdf.name"))
            .setDesc(t("settings.syncPdf.desc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncPDF)
                    .onChange(async (value) => {
                        this.plugin.settings.syncPDF = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(advancedBody)
            .setName(t("settings.exclude.name"))
            .setDesc(t("settings.exclude.desc"))
            .addTextArea((text) =>
                text
                    .setPlaceholder(t("settings.exclude.placeholder"))
                    .setValue(this.plugin.settings.excludePatterns.join("\n"))
                    .onChange(async (value) => {
                        this.plugin.settings.excludePatterns = value
                            .split("\n")
                            .map((pattern) => pattern.trim())
                            .filter((pattern) => pattern.length > 0);
                        await this.plugin.saveSettings();
                        this.plugin.pathFilter = new PathFilter(this.plugin.settings);
                    })
            );

        advancedBody.createEl("h4", { text: t("settings.branchMgmt.title") });

        new Setting(advancedBody)
            .setName(t("settings.currentBranch.name"))
            .setDesc(t("settings.currentBranch.desc", { branch: this.plugin.settings.branch || "main" }))
            .addButton((button) =>
                button.setButtonText(t("settings.loadBranches.button")).onClick(async () => {
                    try {
                        new Notice(t("notice.loadingBranches"));
                        const branches = await this.plugin.listBranches();
                        this.showBranchList(branches);
                    } catch (error: any) {
                        new Notice(t("notice.loadBranchesFailed", { message: error.message }));
                    }
                })
            );

        new Setting(advancedBody)
            .setName(t("settings.createBranch.name"))
            .setDesc(t("settings.createBranch.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.createBranch.placeholder"))
                    .onChange((value) => {
                        this.newBranchName = value.trim();
                    })
            )
            .addButton((button) =>
                button.setButtonText(t("settings.create.button")).onClick(async () => {
                    if (!this.newBranchName) {
                        new Notice(t("notice.branchNameRequired"));
                        return;
                    }

                    try {
                        await this.plugin.createBranch(this.newBranchName);
                        new Notice(t("notice.branchCreated", { branch: this.newBranchName }));
                        this.display();
                    } catch (error: any) {
                        new Notice(t("notice.branchCreateFailed", { message: error.message }));
                    }
                })
            );

        advancedBody.createEl("h4", { text: t("settings.summary.title") });

        new Setting(advancedBody)
            .setName(t("settings.summary.name"))
            .setDesc(t("settings.summary.desc"))
            .addButton((button) =>
                button.setButtonText(t("settings.summary.button")).onClick(() => {
                    this.plugin.showSyncSummary();
                })
            );

        advancedBody.createEl("h4", { text: t("settings.history.title") });

        new Setting(advancedBody)
            .setName(t("settings.history.enable.name"))
            .setDesc(t("settings.history.enable.desc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableSyncHistory)
                    .onChange(async (value) => {
                        this.plugin.settings.enableSyncHistory = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(advancedBody)
            .setName(t("settings.history.max.name"))
            .setDesc(t("settings.history.max.desc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("settings.history.max.placeholder"))
                    .setValue(String(this.plugin.settings.maxSyncHistoryEntries))
                    .onChange(async (value) => {
                        const maxEntries = Number.parseInt(value, 10);
                        this.plugin.settings.maxSyncHistoryEntries = Number.isNaN(maxEntries) || maxEntries <= 0 ? 100 : maxEntries;
                        await this.plugin.saveSettings();
                        this.plugin.historyStore.setMaxEntries(this.plugin.settings.maxSyncHistoryEntries);
                    })
            );

        new Setting(advancedBody)
            .setName(t("settings.history.view.name"))
            .setDesc(t("settings.history.view.desc"))
            .addButton((button) =>
                button.setButtonText(t("settings.history.view.button")).onClick(() => {
                    this.plugin.showSyncHistory();
                })
            )
            .addButton((button) =>
                button.setButtonText(t("settings.history.clear.button")).onClick(() => {
                    this.plugin.clearSyncHistory();
                })
            );
    }

    private showBranchList(branches: Array<{ name: string; isDefault: boolean; protected: boolean }>) {
        const modal = new BranchListModal(this.app, this.plugin, branches, (selectedBranch: string) => {
            this.plugin.settings.branch = selectedBranch;
            this.plugin.saveSettings().then(() => {
                new Notice(this.plugin.t("notice.branchSwitched", { branch: selectedBranch }));
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
    private branches: Array<{ name: string; isDefault: boolean; protected: boolean }>;
    private onSelect: (branch: string) => void;

    constructor(
        app: App,
        plugin: MyPlugin,
        branches: Array<{ name: string; isDefault: boolean; protected: boolean }>,
        onSelect: (branch: string) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.branches = branches;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        const t = this.plugin.t.bind(this.plugin);
        const currentBranch = this.plugin.settings.branch;

        contentEl.empty();
        contentEl.createEl("h2", { text: t("branch.selectTitle") });

        this.branches.forEach((branch) => {
            const container = contentEl.createEl("div", { cls: "branch-item" });
            container.style.padding = "8px";
            container.style.margin = "4px 0";
            container.style.border = "1px solid var(--background-modifier-border)";
            container.style.borderRadius = "4px";

            if (branch.name === currentBranch) {
                container.style.backgroundColor = "var(--interactive-accent)";
                container.style.color = "var(--text-on-accent)";
            }

            container.onclick = () => {
                this.onSelect(branch.name);
                this.close();
            };

            const nameSpan = container.createEl("span", { text: branch.name });
            nameSpan.style.fontWeight = branch.isDefault ? "bold" : "normal";

            if (branch.isDefault) {
                const badge = container.createEl("span", { text: ` ${t("branch.defaultBadge")}` });
                badge.style.fontSize = "0.8em";
                badge.style.marginLeft = "8px";
                badge.style.opacity = "0.8";
            }

            if (branch.protected) {
                const badge = container.createEl("span", { text: ` ${t("branch.protectedBadge")}` });
                badge.style.fontSize = "0.8em";
                badge.style.marginLeft = "8px";
                badge.style.opacity = "0.8";
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
