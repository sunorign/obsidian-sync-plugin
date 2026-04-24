import { t } from "./i18n";
import { SyncStatus, PluginSettings } from "./types";

export class StatusBar {
    private statusBarItem: HTMLElement;
    private settings: PluginSettings;

    constructor(statusBarItem: HTMLElement, settings: PluginSettings) {
        this.statusBarItem = statusBarItem;
        this.settings = settings;
        this.setStatus("idle");
    }

    setStatus(status: SyncStatus) {
        let text = "GitSync: ";
        let color = "";

        switch (status) {
            case "idle":
                text += t(this.settings, "status.idle");
                break;
            case "pulling":
                text += t(this.settings, "status.pulling");
                color = "var(--text-accent)";
                break;
            case "pushing":
                text += t(this.settings, "status.pushing");
                color = "var(--text-accent)";
                break;
            case "success":
                text += t(this.settings, "status.success");
                color = "var(--text-success)";
                // Reset to idle after a few seconds
                setTimeout(() => this.setStatus("idle"), 5000);
                break;
            case "conflict":
                text += t(this.settings, "status.conflict");
                color = "var(--text-error)";
                break;
            case "error":
                text += t(this.settings, "status.error");
                color = "var(--text-error)";
                break;
        }

        this.statusBarItem.setText(text);
        this.statusBarItem.style.color = color;
    }
}
