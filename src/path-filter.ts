import { PluginSettings } from "./types";

export class PathFilter {
    private settings: PluginSettings;

    constructor(settings: PluginSettings) {
        this.settings = settings;
    }

    shouldSync(path: string): boolean {
        // 1. Basic extension filtering
        if (this.settings.syncMarkdownOnly && !path.endsWith(".md")) {
            return false;
        }

        // 2. Exclusion patterns
        for (const pattern of this.settings.excludePatterns) {
            if (path.includes(pattern)) {
                return false;
            }
        }

        // 3. Skip internal files
        if (path.startsWith(".obsidian/")) {
            return false;
        }

        return true;
    }
}
