import { Plugin } from "obsidian";
import { SyncHistory, SyncHistoryEntry, SyncOperationType } from "./types";

export class HistoryStore {
    private plugin: Plugin;
    private history: SyncHistory;
    private historyPath: string;
    private defaultMaxEntries = 100;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.historyPath = `.obsidian/plugins/${plugin.manifest.id}/history.json`;
        this.history = {
            entries: [],
            maxEntries: this.defaultMaxEntries
        };
    }

    async load(): Promise<void> {
        try {
            if (await this.plugin.app.vault.adapter.exists(this.historyPath)) {
                const content = await this.plugin.app.vault.adapter.read(this.historyPath);
                const parsed = JSON.parse(content);
                this.history = {
                    entries: parsed.entries || [],
                    maxEntries: parsed.maxEntries || this.defaultMaxEntries
                };
                this.trimHistory();
            }
        } catch (error) {
            console.error("Failed to load sync history", error);
        }
    }

    async save(): Promise<void> {
        try {
            await this.plugin.app.vault.adapter.write(
                this.historyPath,
                JSON.stringify(this.history, null, 2)
            );
        } catch (error) {
            console.error("Failed to save sync history", error);
        }
    }

    addEntry(
        operationType: SyncOperationType,
        status: 'success' | 'conflict' | 'error',
        message: string,
        filePath?: string,
        error?: string
    ): SyncHistoryEntry {
        const entry: SyncHistoryEntry = {
            id: this.generateId(),
            timestamp: Date.now(),
            operationType,
            filePath,
            status,
            message,
            error
        };

        this.history.entries.unshift(entry);
        this.trimHistory();
        this.save();

        return entry;
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private trimHistory(): void {
        if (this.history.entries.length > this.history.maxEntries) {
            this.history.entries = this.history.entries.slice(0, this.history.maxEntries);
        }
    }

    getEntries(): SyncHistoryEntry[] {
        return this.history.entries;
    }

    clearHistory(): void {
        this.history.entries = [];
        this.save();
    }

    setMaxEntries(max: number): void {
        this.history.maxEntries = max;
        this.trimHistory();
        this.save();
    }

    getMaxEntries(): number {
        return this.history.maxEntries;
    }

    exportHistory(): string {
        return JSON.stringify(this.history, null, 2);
    }
}
