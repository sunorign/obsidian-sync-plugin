export class Logger {
    private prefix: string;

    constructor(prefix: string = "GitHubSync") {
        this.prefix = prefix;
    }

    info(message: string) {
        console.log(`[${this.prefix}] INFO: ${message}`);
    }

    warn(message: string) {
        console.warn(`[${this.prefix}] WARN: ${message}`);
    }

    error(message: string, error?: unknown) {
        console.error(`[${this.prefix}] ERROR: ${message}`, error);
    }

    debug(message: string) {
        // Only log debug in dev environment or if enabled in settings
        console.debug(`[${this.prefix}] DEBUG: ${message}`);
    }
}
