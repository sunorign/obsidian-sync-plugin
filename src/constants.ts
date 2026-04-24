export const EMPTY_DIR_PLACEHOLDER = ".obsidian-github-sync.keep";

export function isEmptyDirPlaceholderPath(path: string): boolean {
    return path.endsWith(`/${EMPTY_DIR_PLACEHOLDER}`) || path === EMPTY_DIR_PLACEHOLDER;
}
