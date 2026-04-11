import { App, normalizePath, Notice, TFile, Modal } from "obsidian";
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
            await this.app.vault.create(localConflictPath, input.localContent);
            await this.app.vault.create(remoteConflictPath, input.remoteContent);

            new DiffConflictModal(this.app, input.path, "pull", input.localContent, input.remoteContent, async (choice: 'local' | 'remote') => {
                await this.applyResolution(input.path, choice, input.localContent, input.remoteContent);
            }).open();

            this.logger.info(`Conflict files created for ${input.path}, diff modal opened`);
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
            await this.app.vault.create(localConflictPath, input.localContent);
            await this.app.vault.create(remoteConflictPath, input.remoteContent);

            new DiffConflictModal(this.app, input.path, "push", input.localContent, input.remoteContent, async (choice: 'local' | 'remote') => {
                await this.applyResolution(input.path, choice, input.localContent, input.remoteContent);
            }).open();

            this.logger.info(`Push conflict handled, diff modal opened for ${input.path}`);
        } catch (error) {
            this.logger.error(`Failed to create push conflict files for ${input.path}`, error);
            new Notice(`Failed to handle conflict for ${input.path}. Check logs.`);
        }
    }

    private async applyResolution(
        path: string,
        choice: 'local' | 'remote',
        localContent: string,
        remoteContent: string
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            const content = choice === 'local' ? localContent : remoteContent;
            await this.app.vault.modify(file, content);
            new Notice(`Conflict resolved: kept ${choice} version`);
            this.logger.info(`Conflict resolved for ${path}: kept ${choice} version`);
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

class DiffConflictModal extends Modal {
    private filePath: string;
    private conflictType: 'pull' | 'push';
    private localContent: string;
    private remoteContent: string;
    private onResolve: (choice: 'local' | 'remote') => Promise<void>;

    constructor(
        app: App,
        filePath: string,
        conflictType: 'pull' | 'push',
        localContent: string,
        remoteContent: string,
        onResolve: (choice: 'local' | 'remote') => Promise<void>
    ) {
        super(app);
        this.filePath = filePath;
        this.conflictType = conflictType;
        this.localContent = localContent;
        this.remoteContent = remoteContent;
        this.onResolve = onResolve;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: `Conflict: ${this.filePath}` });

        const desc = contentEl.createEl("p");
        desc.textContent = this.conflictType === 'pull' 
            ? "Remote has changed while you modified the file locally."
            : "Remote has changed while you modified the file locally.";

        contentEl.createEl("div", { cls: "diff-container" }, container => {
            container.style.display = "grid";
            container.style.gridTemplateColumns = "1fr 1fr";
            container.style.gap = "8px";

            this.createSide(container, "Local (your version)", this.localContent, "local");
            this.createSide(container, "Remote (GitHub version)", this.remoteContent, "remote");
        });

        const buttonsContainer = contentEl.createEl("div");
        buttonsContainer.style.display = "flex";
        buttonsContainer.style.justifyContent = "flex-end";
        buttonsContainer.style.gap = "8px";
        buttonsContainer.style.marginTop = "16px";

        const localBtn = buttonsContainer.createEl("button");
        localBtn.textContent = "Keep Local";
        localBtn.addClass("mod-cta");
        localBtn.onclick = async () => {
            await this.onResolve('local');
            this.close();
        };

        const remoteBtn = buttonsContainer.createEl("button");
        remoteBtn.textContent = "Keep Remote";
        remoteBtn.onclick = async () => {
            await this.onResolve('remote');
            this.close();
        };
    }

    private createSide(container: HTMLElement, title: string, content: string, side: 'local' | 'remote') {
        const sideContainer = container.createEl("div");
        sideContainer.style.border = "1px solid var(--background-modifier-border)";
        sideContainer.style.borderRadius = "4px";
        sideContainer.style.overflow = "auto";
        sideContainer.style.maxHeight = "400px";

        const titleEl = sideContainer.createEl("div", { text: title });
        titleEl.style.backgroundColor = side === 'local' 
            ? "var(--background-modifier-accent)" 
            : "var(--background-modifier-accent)";
        titleEl.style.padding = "4px 8px";
        titleEl.style.fontWeight = "bold";
        titleEl.style.position = "sticky";
        titleEl.style.top = "0";

        const pre = sideContainer.createEl("pre");
        pre.style.margin = "0";
        pre.style.padding = "8px";
        pre.style.whiteSpace = "pre-wrap";
        pre.style.wordBreak = "break-word";
        pre.textContent = content;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
