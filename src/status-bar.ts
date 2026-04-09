import { SyncStatus } from "./types";

export class StatusBar {
    private statusBarItem: HTMLElement;

    constructor(statusBarItem: HTMLElement) {
        this.statusBarItem = statusBarItem;
        this.setStatus("idle");
    }

    setStatus(status: SyncStatus) {
        let text = "GitSync: ";
        let color = "";

        switch (status) {
            case "idle":
                text += "idle";
                break;
            case "pulling":
                text += "pulling...";
                color = "var(--text-accent)";
                break;
            case "pushing":
                text += "pushing...";
                color = "var(--text-accent)";
                break;
            case "success":
                text += "success";
                color = "var(--text-success)";
                // Reset to idle after a few seconds
                setTimeout(() => this.setStatus("idle"), 5000);
                break;
            case "conflict":
                text += "conflict";
                color = "var(--text-error)";
                break;
            case "error":
                text += "error";
                color = "var(--text-error)";
                break;
        }

        this.statusBarItem.setText(text);
        this.statusBarItem.style.color = color;
    }
}
