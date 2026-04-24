import { PluginSettings } from "./types";
import { minimatch } from "minimatch";
import { isEmptyDirPlaceholderPath } from "./constants";

// Supported attachment extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const PDF_EXTENSIONS = ['.pdf'];

export class PathFilter {
    private settings: PluginSettings;

    constructor(settings: PluginSettings) {
        this.settings = settings;
    }

    shouldSync(path: string): boolean {
        if (isEmptyDirPlaceholderPath(path)) {
            return false;
        }

        // 1. Skip conflict files
        if (path.includes('.conflict.') && (path.endsWith('.local.md') || path.endsWith('.remote.md'))) {
            return false;
        }

        // 2. Check extension against enabled sync options
        const isMarkdown = path.endsWith('.md');
        const isImage = this.isImageFile(path);
        const isPDFFile = this.isPDFFile(path);

        if (isMarkdown) {
            // Always allow markdown if syncMarkdownOnly is enabled (it always is by default)
            // Even if other options are disabled, markdown should still sync
        } else if (isImage && !this.settings.syncImages) {
            return false;
        } else if (isPDFFile && !this.settings.syncPDF) {
            return false;
        } else if (!isMarkdown && !isImage && !isPDFFile) {
            // Not a supported file type for sync in this version
            return false;
        }

        // 3. Skip internal .obsidian folder by default
        if (path.startsWith('.obsidian/')) {
            return false;
        }

        // 4. Check exclusion patterns with glob matching
        for (const pattern of this.settings.excludePatterns) {
            if (minimatch(path, pattern, { dot: true }) || path.includes(pattern)) {
                return false;
            }
        }

        return true;
    }

    private isImageFile(path: string): boolean {
        const lowerPath = path.toLowerCase();
        return IMAGE_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
    }

    private isPDFFile(path: string): boolean {
        const lowerPath = path.toLowerCase();
        return PDF_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
    }

    /**
     * Check if a file is an attachment (non-markdown) that should be synced
     */
    isAttachment(path: string): boolean {
        const lowerPath = path.toLowerCase();
        const isImage = IMAGE_EXTENSIONS.some(ext => lowerPath.endsWith(ext)) && this.settings.syncImages;
        const isPDF = PDF_EXTENSIONS.some(ext => lowerPath.endsWith(ext)) && this.settings.syncPDF;
        return isImage || isPDF;
    }
}
