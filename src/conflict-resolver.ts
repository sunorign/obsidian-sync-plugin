import { App, normalizePath, Notice, TFile, Modal } from "obsidian";
import { Logger } from "./logger";

type DiffKind = "equal" | "added" | "removed" | "modified";
type ResolutionChoice = "local" | "remote";

interface DiffSegment {
    text: string;
    changed: boolean;
}

interface DiffRow {
    leftLineNumber: number | null;
    rightLineNumber: number | null;
    leftText: string;
    rightText: string;
    kind: DiffKind;
    hunkId: number | null;
}

interface DiffHunk {
    id: number;
    rowIndexes: number[];
}

type VisibleRun =
    | { kind: "rows"; rows: Array<{ row: DiffRow; index: number }> }
    | { kind: "collapsed"; count: number };

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
        baseContent?: string;
    }): Promise<void> {
        this.logger.warn(`Resolving pull conflict for ${input.path}`);

        const baseName = input.path.replace(/\.md$/, "");
        const localConflictPath = normalizePath(`${baseName}.conflict.local.md`);
        const remoteConflictPath = normalizePath(`${baseName}.conflict.remote.md`);

        try {
            await this.upsertConflictFile(localConflictPath, input.localContent);
            await this.upsertConflictFile(remoteConflictPath, input.remoteContent);

            new DiffConflictModal(
                this.app,
                input.path,
                "pull",
                input.baseContent,
                input.localContent,
                input.remoteContent,
                async (content: string, label: string) => {
                    await this.applyResolution(input.path, content, label);
                }
            ).open();

            this.logger.info(`Conflict files created for ${input.path}, compare view opened`);
        } catch (error) {
            this.logger.error(`Failed to create conflict files for ${input.path}`, error);
            new Notice(`Failed to handle conflict for ${input.path}. Check logs.`);
        }
    }

    async resolvePushConflict(input: {
        path: string;
        localContent: string;
        remoteContent: string;
        baseContent?: string;
    }): Promise<void> {
        this.logger.warn(`Resolving push conflict for ${input.path}`);

        const baseName = input.path.replace(/\.md$/, "");
        const localConflictPath = normalizePath(`${baseName}.conflict.local.md`);
        const remoteConflictPath = normalizePath(`${baseName}.conflict.remote.md`);

        try {
            await this.upsertConflictFile(localConflictPath, input.localContent);
            await this.upsertConflictFile(remoteConflictPath, input.remoteContent);

            new DiffConflictModal(
                this.app,
                input.path,
                "push",
                input.baseContent,
                input.localContent,
                input.remoteContent,
                async (content: string, label: string) => {
                    await this.applyResolution(input.path, content, label);
                }
            ).open();

            this.logger.info(`Push conflict handled, compare view opened for ${input.path}`);
        } catch (error) {
            this.logger.error(`Failed to create push conflict files for ${input.path}`, error);
            new Notice(`Failed to handle conflict for ${input.path}. Check logs.`);
        }
    }

    private async applyResolution(
        path: string,
        content: string,
        label: string
    ): Promise<void> {
        const baseName = path.replace(/\.md$/, "");
        const conflictPaths = [
            normalizePath(`${baseName}.conflict.local.md`),
            normalizePath(`${baseName}.conflict.remote.md`)
        ];
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await this.app.vault.modify(file, content);
            await this.cleanupConflictFiles(conflictPaths);
            new Notice(`Conflict resolved: ${label}`);
            this.logger.info(`Conflict resolved for ${path}: ${label}`);
        }
    }

    private async upsertConflictFile(path: string, content: string): Promise<void> {
        const existingFile = this.app.vault.getAbstractFileByPath(path);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
            return;
        }

        await this.app.vault.create(path, content);
    }

    private async cleanupConflictFiles(paths: string[]): Promise<void> {
        for (const path of paths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                await this.app.vault.delete(file);
            }
        }
    }
}

class DiffConflictModal extends Modal {
    private filePath: string;
    private conflictType: "pull" | "push";
    private baseContent?: string;
    private localContent: string;
    private remoteContent: string;
    private onResolve: (content: string, label: string) => Promise<void>;
    private diffRows: DiffRow[];
    private hunks: DiffHunk[];
    private resolutionChoices = new Map<number, ResolutionChoice>();
    private showOnlyChanges = true;
    private compareGridEl!: HTMLElement;
    private modeLabelEl!: HTMLElement;

    constructor(
        app: App,
        filePath: string,
        conflictType: "pull" | "push",
        baseContent: string | undefined,
        localContent: string,
        remoteContent: string,
        onResolve: (content: string, label: string) => Promise<void>
    ) {
        super(app);
        this.filePath = filePath;
        this.conflictType = conflictType;
        this.baseContent = baseContent;
        this.localContent = localContent;
        this.remoteContent = remoteContent;
        this.onResolve = onResolve;
        this.diffRows = buildDiffRows(localContent, remoteContent);
        this.hunks = buildDiffHunks(this.diffRows);
        this.hunks.forEach(hunk => this.resolutionChoices.set(hunk.id, "local"));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.addClass("github-sync-compare-modal");
        this.modalEl.style.width = "100vw";
        this.modalEl.style.maxWidth = "100vw";
        this.modalEl.style.height = "100vh";
        this.modalEl.style.margin = "0";
        this.modalEl.style.borderRadius = "0";
        this.contentEl.style.width = "100%";
        this.contentEl.style.height = "100%";
        this.contentEl.style.maxHeight = "100vh";
        this.contentEl.style.padding = "0";

        const shell = contentEl.createEl("div", { cls: "github-sync-compare-shell" });
        const header = shell.createEl("div", { cls: "github-sync-compare-header" });

        const headerText = header.createEl("div", { cls: "github-sync-compare-header-text" });
        headerText.createEl("h2", { text: this.filePath });
        headerText.createEl("p", {
            text: this.conflictType === "pull"
                ? "Remote changed while you edited locally. Review each conflict block and save the merged result."
                : "Remote changed before your push. Review each conflict block and save the merged result."
        });

        const actions = header.createEl("div", { cls: "github-sync-compare-actions" });

        const acceptLocalButton = actions.createEl("button", { text: "Accept All Local" });
        acceptLocalButton.addClass("mod-cta");
        acceptLocalButton.onclick = async () => {
            await this.onResolve(this.localContent, "kept local version");
            this.close();
        };

        const acceptRemoteButton = actions.createEl("button", { text: "Accept All Remote" });
        acceptRemoteButton.onclick = async () => {
            await this.onResolve(this.remoteContent, "kept remote version");
            this.close();
        };

        const saveMergedButton = actions.createEl("button", { text: "Save Merged" });
        saveMergedButton.addClass("mod-cta");
        saveMergedButton.onclick = async () => {
            await this.onResolve(this.buildMergedContent(), "saved merged result");
            this.close();
        };

        const summary = shell.createEl("div", { cls: "github-sync-compare-summary" });
        const changedRows = this.diffRows.filter(row => row.kind !== "equal").length;
        summary.createEl("span", {
            text: `${this.hunks.length} conflict block${this.hunks.length !== 1 ? "s" : ""}`
        });
        summary.createEl("span", {
            text: `${changedRows} changed row${changedRows !== 1 ? "s" : ""}`
        });
        this.modeLabelEl = summary.createEl("span", {
            text: this.showOnlyChanges ? "Showing changed blocks only" : "Showing full file"
        });
        if (this.baseContent) {
            summary.createEl("span", {
                text: "Base snapshot available for upcoming 3-way compare"
            });
        }

        const toggleVisibilityButton = actions.createEl("button", {
            text: this.showOnlyChanges ? "Show Full File" : "Hide Unchanged"
        });
        toggleVisibilityButton.onclick = () => {
            this.showOnlyChanges = !this.showOnlyChanges;
            toggleVisibilityButton.setText(this.showOnlyChanges ? "Show Full File" : "Hide Unchanged");
            this.modeLabelEl.setText(this.showOnlyChanges ? "Showing changed blocks only" : "Showing full file");
            this.renderCompareGrid();
        };

        if (this.hunks.length === 0) {
            const notice = shell.createEl("div", { cls: "github-sync-compare-empty" });
            notice.createEl("strong", { text: "No textual differences detected." });
            notice.createEl("div", {
                text: "The remote SHA changed, but the file content currently looks identical. You can accept either side."
            });
        }

        this.compareGridEl = shell.createEl("div", { cls: "github-sync-compare-grid" });
        this.renderCompareGrid();
    }

    private renderCompareGrid() {
        this.compareGridEl.empty();
        this.compareGridEl.createEl("div", { text: "Local", cls: "github-sync-compare-colhead is-local" });
        this.compareGridEl.createEl("div", { text: "Remote", cls: "github-sync-compare-colhead is-remote" });

        const runs = this.showOnlyChanges ? buildVisibleRuns(this.diffRows) : [{ kind: "rows" as const, rows: this.diffRows.map((row, index) => ({ row, index })) }];

        let previousHunkId: number | null = null;

        runs.forEach(run => {
            if (run.kind === "collapsed") {
                const collapsed = this.compareGridEl.createEl("button", {
                    cls: "github-sync-compare-collapsed",
                    text: `Expand ${run.count} unchanged line${run.count !== 1 ? "s" : ""}`
                });
                collapsed.onclick = () => {
                    this.showOnlyChanges = false;
                    this.modeLabelEl.setText("Showing full file");
                    this.renderCompareGrid();
                };
                return;
            }

            run.rows.forEach(({ row, index }) => {
                if (row.hunkId !== null && row.hunkId !== previousHunkId) {
                    this.renderHunkToolbar(this.compareGridEl, row.hunkId);
                }
                previousHunkId = row.hunkId;
                this.renderCompareRow(this.compareGridEl, row, index);
            });
        });
    }

    private renderHunkToolbar(container: HTMLElement, hunkId: number) {
        const toolbar = container.createEl("div", { cls: "github-sync-hunk-toolbar" });
        toolbar.dataset.hunkId = String(hunkId);

        const title = toolbar.createEl("div", { cls: "github-sync-hunk-title" });
        title.createEl("strong", { text: `Conflict Block ${hunkId + 1}` });
        title.createEl("span", { text: `Current choice: ${this.resolutionChoices.get(hunkId)}` });

        const buttons = toolbar.createEl("div", { cls: "github-sync-hunk-actions" });
        const useLocalButton = buttons.createEl("button", { text: "Use Local" });
        const useRemoteButton = buttons.createEl("button", { text: "Use Remote" });

        useLocalButton.onclick = () => {
            this.setHunkChoice(hunkId, "local");
        };

        useRemoteButton.onclick = () => {
            this.setHunkChoice(hunkId, "remote");
        };

        this.applyHunkToolbarState(toolbar, hunkId);
    }

    private renderCompareRow(container: HTMLElement, row: DiffRow, rowIndex: number) {
        const localCell = container.createEl("div", { cls: "github-sync-compare-cell" });
        const remoteCell = container.createEl("div", { cls: "github-sync-compare-cell" });

        this.decorateCompareCell(localCell, row, rowIndex, "local");
        this.decorateCompareCell(remoteCell, row, rowIndex, "remote");
    }

    private decorateCompareCell(
        cell: HTMLElement,
        row: DiffRow,
        rowIndex: number,
        side: ResolutionChoice
    ) {
        cell.addClass(`is-${side}`);
        cell.addClass(`is-${row.kind}`);
        if (row.hunkId !== null) {
            cell.addClass("is-conflict-row");
            cell.onclick = () => this.setHunkChoice(row.hunkId!, side);
        }

        const activeChoice = row.hunkId !== null ? this.resolutionChoices.get(row.hunkId) : null;
        if (activeChoice === side) {
            cell.addClass("is-selected");
        }

        const lineNumber = side === "local" ? row.leftLineNumber : row.rightLineNumber;
        const text = side === "local" ? row.leftText : row.rightText;

        const lineNumberEl = cell.createEl("div", { cls: "github-sync-compare-line-number" });
        lineNumberEl.textContent = lineNumber === null ? "" : String(lineNumber);

        const textEl = cell.createEl("div", { cls: "github-sync-compare-line-text" });
        const segments = row.kind === "modified"
            ? buildInlineDiffSegments(row.leftText, row.rightText, side)
            : [{ text: text.length > 0 ? text : " ", changed: row.kind !== "equal" }];

        for (const segment of segments) {
            const segmentEl = textEl.createEl("span", { cls: "github-sync-compare-inline-segment" });
            if (segment.changed) {
                segmentEl.addClass("is-changed");
            }
            segmentEl.textContent = segment.text.length > 0 ? segment.text : " ";
        }

        cell.dataset.rowIndex = String(rowIndex);
        if (row.hunkId !== null) {
            cell.dataset.hunkId = String(row.hunkId);
        }
    }

    private setHunkChoice(hunkId: number, choice: ResolutionChoice) {
        this.resolutionChoices.set(hunkId, choice);
        this.refreshSelectionState(hunkId);
    }

    private refreshSelectionState(hunkId: number) {
        const choice = this.resolutionChoices.get(hunkId);
        const rowIndexes = this.hunks.find(hunk => hunk.id === hunkId)?.rowIndexes ?? [];

        rowIndexes.forEach(rowIndex => {
            const localCell = this.contentEl.querySelector(
                `.github-sync-compare-cell.is-local[data-row-index="${rowIndex}"]`
            ) as HTMLElement | null;
            const remoteCell = this.contentEl.querySelector(
                `.github-sync-compare-cell.is-remote[data-row-index="${rowIndex}"]`
            ) as HTMLElement | null;

            localCell?.toggleClass("is-selected", choice === "local");
            remoteCell?.toggleClass("is-selected", choice === "remote");
        });

        const toolbar = this.contentEl.querySelector(
            `.github-sync-hunk-toolbar[data-hunk-id="${hunkId}"]`
        ) as HTMLElement | null;

        if (toolbar) {
            this.applyHunkToolbarState(toolbar, hunkId);
        }
    }

    private applyHunkToolbarState(toolbar: HTMLElement, hunkId: number) {
        const choice = this.resolutionChoices.get(hunkId) ?? "local";
        toolbar.toggleClass("is-local-selected", choice === "local");
        toolbar.toggleClass("is-remote-selected", choice === "remote");

        const label = toolbar.querySelector(".github-sync-hunk-title span");
        if (label) {
            label.textContent = `Current choice: ${choice}`;
        }
    }

    private buildMergedContent(): string {
        const mergedLines: string[] = [];

        this.diffRows.forEach(row => {
            if (row.kind === "equal") {
                mergedLines.push(row.leftText);
                return;
            }

            const choice = row.hunkId !== null
                ? this.resolutionChoices.get(row.hunkId) ?? "local"
                : "local";

            if (choice === "local") {
                if (row.leftLineNumber !== null) {
                    mergedLines.push(row.leftText);
                }
                return;
            }

            if (row.rightLineNumber !== null) {
                mergedLines.push(row.rightText);
            }
        });

        return mergedLines.join("\n");
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.removeClass("github-sync-compare-modal");
        this.modalEl.removeAttribute("style");
        this.contentEl.removeAttribute("style");
    }
}

function buildDiffRows(localContent: string, remoteContent: string): DiffRow[] {
    const leftLines = localContent.split("\n");
    const rightLines = remoteContent.split("\n");
    const lcs = buildLcsTable(leftLines, rightLines);
    const rows: DiffRow[] = [];

    let leftIndex = 0;
    let rightIndex = 0;
    let leftLineNumber = 1;
    let rightLineNumber = 1;

    while (leftIndex < leftLines.length && rightIndex < rightLines.length) {
        if (leftLines[leftIndex] === rightLines[rightIndex]) {
            rows.push({
                leftLineNumber,
                rightLineNumber,
                leftText: leftLines[leftIndex],
                rightText: rightLines[rightIndex],
                kind: "equal",
                hunkId: null,
            });
            leftIndex++;
            rightIndex++;
            leftLineNumber++;
            rightLineNumber++;
            continue;
        }

        if (lcs[leftIndex + 1][rightIndex] >= lcs[leftIndex][rightIndex + 1]) {
            rows.push({
                leftLineNumber,
                rightLineNumber: null,
                leftText: leftLines[leftIndex],
                rightText: "",
                kind: "removed",
                hunkId: null,
            });
            leftIndex++;
            leftLineNumber++;
        } else {
            rows.push({
                leftLineNumber: null,
                rightLineNumber,
                leftText: "",
                rightText: rightLines[rightIndex],
                kind: "added",
                hunkId: null,
            });
            rightIndex++;
            rightLineNumber++;
        }
    }

    while (leftIndex < leftLines.length) {
        rows.push({
            leftLineNumber,
            rightLineNumber: null,
            leftText: leftLines[leftIndex],
            rightText: "",
            kind: "removed",
            hunkId: null,
        });
        leftIndex++;
        leftLineNumber++;
    }

    while (rightIndex < rightLines.length) {
        rows.push({
            leftLineNumber: null,
            rightLineNumber,
            leftText: "",
            rightText: rightLines[rightIndex],
            kind: "added",
            hunkId: null,
        });
        rightIndex++;
        rightLineNumber++;
    }

    return mergeModifiedRows(rows);
}

function buildDiffHunks(rows: DiffRow[]): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    rows.forEach((row, index) => {
        if (row.kind === "equal") {
            currentHunk = null;
            return;
        }

        if (!currentHunk) {
            currentHunk = {
                id: hunks.length,
                rowIndexes: [],
            };
            hunks.push(currentHunk);
        }

        currentHunk.rowIndexes.push(index);
        row.hunkId = currentHunk.id;
    });

    return hunks;
}

function buildLcsTable<T>(leftValues: T[], rightValues: T[]): number[][] {
    const table = Array.from({ length: leftValues.length + 1 }, () =>
        Array.from({ length: rightValues.length + 1 }, () => 0)
    );

    for (let i = leftValues.length - 1; i >= 0; i--) {
        for (let j = rightValues.length - 1; j >= 0; j--) {
            if (leftValues[i] === rightValues[j]) {
                table[i][j] = table[i + 1][j + 1] + 1;
            } else {
                table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
            }
        }
    }

    return table;
}

function mergeModifiedRows(rows: DiffRow[]): DiffRow[] {
    const merged: DiffRow[] = [];

    for (let i = 0; i < rows.length; i++) {
        const current = rows[i];
        const next = rows[i + 1];

        if (current.kind === "removed" && next?.kind === "added") {
            merged.push({
                leftLineNumber: current.leftLineNumber,
                rightLineNumber: next.rightLineNumber,
                leftText: current.leftText,
                rightText: next.rightText,
                kind: "modified",
                hunkId: null,
            });
            i++;
            continue;
        }

        if (current.kind === "added" && next?.kind === "removed") {
            merged.push({
                leftLineNumber: next.leftLineNumber,
                rightLineNumber: current.rightLineNumber,
                leftText: next.leftText,
                rightText: current.rightText,
                kind: "modified",
                hunkId: null,
            });
            i++;
            continue;
        }

        merged.push(current);
    }

    return merged;
}

function buildInlineDiffSegments(
    leftText: string,
    rightText: string,
    side: ResolutionChoice
): DiffSegment[] {
    const leftChars = Array.from(leftText);
    const rightChars = Array.from(rightText);
    const lcs = buildLcsTable(leftChars, rightChars);
    const segments: DiffSegment[] = [];

    let leftIndex = 0;
    let rightIndex = 0;

    const pushSegment = (text: string, changed: boolean) => {
        if (!text) {
            return;
        }

        const previous = segments[segments.length - 1];
        if (previous && previous.changed === changed) {
            previous.text += text;
            return;
        }

        segments.push({ text, changed });
    };

    while (leftIndex < leftChars.length && rightIndex < rightChars.length) {
        if (leftChars[leftIndex] === rightChars[rightIndex]) {
            pushSegment(side === "local" ? leftChars[leftIndex] : rightChars[rightIndex], false);
            leftIndex++;
            rightIndex++;
            continue;
        }

        if (lcs[leftIndex + 1][rightIndex] >= lcs[leftIndex][rightIndex + 1]) {
            if (side === "local") {
                pushSegment(leftChars[leftIndex], true);
            }
            leftIndex++;
        } else {
            if (side === "remote") {
                pushSegment(rightChars[rightIndex], true);
            }
            rightIndex++;
        }
    }

    while (leftIndex < leftChars.length) {
        if (side === "local") {
            pushSegment(leftChars[leftIndex], true);
        }
        leftIndex++;
    }

    while (rightIndex < rightChars.length) {
        if (side === "remote") {
            pushSegment(rightChars[rightIndex], true);
        }
        rightIndex++;
    }

    return segments.length > 0 ? segments : [{ text: " ", changed: false }];
}

function buildVisibleRuns(rows: DiffRow[]): VisibleRun[] {
    const runs: VisibleRun[] = [];
    let equalBuffer: Array<{ row: DiffRow; index: number }> = [];
    let changedBuffer: Array<{ row: DiffRow; index: number }> = [];

    const flushEqual = () => {
        if (equalBuffer.length === 0) {
            return;
        }

        if (equalBuffer.length <= 2) {
            runs.push({ kind: "rows", rows: equalBuffer });
        } else {
            runs.push({ kind: "collapsed", count: equalBuffer.length });
        }
        equalBuffer = [];
    };

    const flushChanged = () => {
        if (changedBuffer.length === 0) {
            return;
        }
        runs.push({ kind: "rows", rows: changedBuffer });
        changedBuffer = [];
    };

    rows.forEach((row, index) => {
        if (row.kind === "equal") {
            flushChanged();
            equalBuffer.push({ row, index });
            return;
        }

        flushEqual();
        changedBuffer.push({ row, index });
    });

    flushEqual();
    flushChanged();

    return runs;
}
