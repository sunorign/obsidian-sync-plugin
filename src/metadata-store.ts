import { SyncMetadata } from "./types";
import { Plugin } from "obsidian";

export class MetadataStore {
    private plugin: Plugin;
    private metadata: SyncMetadata;
    private metadataPath: string;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.metadataPath = `.obsidian/plugins/${plugin.manifest.id}/metadata.json`;
        this.metadata = { remoteShaByPath: {}, baseTextByPath: {} };
    }

    async load(): Promise<void> {
        try {
            if (await this.plugin.app.vault.adapter.exists(this.metadataPath)) {
                const content = await this.plugin.app.vault.adapter.read(this.metadataPath);
                this.metadata = JSON.parse(content);
                this.metadata.baseTextByPath = this.metadata.baseTextByPath || {};
            }
        } catch (error) {
            console.error("Failed to load metadata", error);
        }
    }

    async save(): Promise<void> {
        try {
            await this.plugin.app.vault.adapter.write(
                this.metadataPath,
                JSON.stringify(this.metadata, null, 2)
            );
        } catch (error) {
            console.error("Failed to save metadata", error);
        }
    }

    getSha(path: string): string | undefined {
        return this.metadata.remoteShaByPath[path];
    }

    updateSha(path: string, sha: string) {
        this.metadata.remoteShaByPath[path] = sha;
    }

    removeSha(path: string) {
        delete this.metadata.remoteShaByPath[path];
        if (this.metadata.baseTextByPath) {
            delete this.metadata.baseTextByPath[path];
        }
    }

    getBaseText(path: string): string | undefined {
        return this.metadata.baseTextByPath?.[path];
    }

    updateBaseText(path: string, text: string) {
        if (!this.metadata.baseTextByPath) {
            this.metadata.baseTextByPath = {};
        }
        this.metadata.baseTextByPath[path] = text;
    }

    updateLastSyncTime() {
        this.metadata.lastSyncAt = Date.now();
    }

    getLastSyncAt(): number | undefined {
        return this.metadata.lastSyncAt;
    }

    getAllShaEntries(): Array<[string, string]> {
        return Object.entries(this.metadata.remoteShaByPath);
    }
}
