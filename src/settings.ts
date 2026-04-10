import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import MyPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

export class GitHubSyncSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

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
            .setDesc("Push all dirty files to GitHub immediately")
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
    }
}
