import { App, normalizePath, Notice } from "obsidian";
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

            new Notice(`Conflict in ${input.path}. Local and remote copies created.`, 10000);
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

            new Notice(`Conflict while pushing ${input.path}. Remote changes detected. Conflict copies created.`, 10000);
            this.logger.info(`Push conflict handled. Conflict files created for ${input.path}`);
        } catch (error) {
            this.logger.error(`Failed to create push conflict files for ${input.path}`, error);
        }
    }
}
