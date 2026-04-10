import { App, normalizePath, Notice, TFile } from "obsidian";
import { Logger } from "./logger";

export class ConflictResolver {
    private app: App;
    private logger: Logger;

    constructor(app: App, logger: Logger) {
        this.app = app;
        this.logger = logger;
    }

    async resolvePullConflict(input: {
        path: string;
        localContent: string;
        remoteContent: string;
    }): Promise<void> {
        this.logger.warn(`Resolving pull conflict for ${input.path}`);
        
        const baseName = input.path.replace(/\.md$/, "");
        const localConflictPath = normalizePath(`${baseName}.conflict.local.md`);
        const remoteConflictPath = normalizePath(`${baseName}.conflict.remote.md`);

        try {
            // Save local version as a conflict copy
            await this.app.vault.create(localConflictPath, input.localContent);
            
            // Save remote version as a conflict copy
            await this.app.vault.create(remoteConflictPath, input.remoteContent);

            // Get the conflict files for the notice message
            const localFile = this.app.vault.getAbstractFileByPath(localConflictPath);
            const remoteFile = this.app.vault.getAbstractFileByPath(remoteConflictPath);
            
            let message = `**Conflict detected** in \`${input.path}\`\n\n`;
            message += `- Local version: [[${localConflictPath}]]\n`;
            message += `- Remote version: [[${remoteConflictPath}]]\n\n`;
            message += `Use Obsidian's core plugin "Compare files" to diff and merge manually.`;

            new Notice(message, 15000);
            this.logger.info(`Conflict files created: ${localConflictPath}, ${remoteConflictPath}`);
        } catch (error) {
            this.logger.error(`Failed to create conflict files for ${input.path}`, error);
            new Notice(`Failed to handle conflict for ${input.path}. Check logs.`);
        }
    }

    async resolvePushConflict(input: {
        path: string;
        localContent: string;
        remoteContent: string;
    }): Promise<void> {
        this.logger.warn(`Resolving push conflict for ${input.path}`);
        
        const baseName = input.path.replace(/\.md$/, "");
        const localConflictPath = normalizePath(`${baseName}.conflict.local.md`);
        const remoteConflictPath = normalizePath(`${baseName}.conflict.remote.md`);

        try {
            // Local file already exists with localContent, so we just create the remote conflict copy
            // and optionally a local copy for safety
            await this.app.vault.create(localConflictPath, input.localContent);
            await this.app.vault.create(remoteConflictPath, input.remoteContent);

            // Create a helpful notice with internal links for easy comparison
            let message = `**Conflict detected while pushing** to \`${input.path}\`\n\n`;
            message += `Remote has been modified since your last sync.\n`;
            message += `- Your version: [[${localConflictPath}]]\n`;
            message += `- GitHub version: [[${remoteConflictPath}]]\n\n`;
            message += `Use Obsidian → Right-click → Compare files to merge manually.`;

            new Notice(message, 15000);
            this.logger.info(`Push conflict handled. Conflict files created for ${input.path}`);
        } catch (error) {
            this.logger.error(`Failed to create push conflict files for ${input.path}`, error);
            new Notice(`Failed to handle conflict for ${input.path}. Check logs.`);
        }
    }

    /**
     * Generate a conflict summary note that contains both versions
     * for easy viewing and merging
     */
    async createConflictSummary(input: {
        originalPath: string;
        localContent: string;
        remoteContent: string;
        conflictType: 'pull' | 'push';
    }): Promise<string> {
        const baseName = input.originalPath.replace(/\.md$/, "");
        const summaryPath = normalizePath(`${baseName}.conflict-summary.md`);

        let content = `# Conflict: ${input.originalPath}\n\n`;
        content += `**Conflict type**: ${input.conflictType === 'pull' ? 'Pull (remote → local)' : 'Push (local → remote)'}\n\n`;
        content += `---\n\n`;
        content += `## 📄 Local Version (${input.conflictType === 'pull' ? 'your changes' : 'current file'})\n\n\`\`\`\n${input.localContent}\n\`\`\`\n\n`;
        content += `---\n\n`;
        content += `## 📄 Remote Version (${input.conflictType === 'pull' ? 'GitHub' : 'GitHub changes'})\n\n\`\`\`\n${input.remoteContent}\n\`\`\`\n\n`;
        content += `---\n\n`;
        content += `After merging the correct version into the original file, you can delete this summary and the conflict copies.\n`;

        await this.app.vault.create(summaryPath, content);
        this.logger.info(`Conflict summary created: ${summaryPath}`);

        return summaryPath;
    }
}
