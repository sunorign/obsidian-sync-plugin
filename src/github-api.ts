import { Octokit } from "@octokit/rest";
import { GitHubConfig, RemoteFileMeta, RemoteFileContent, UpsertFileInput, DeleteFileInput, BranchInfo, CreateBranchInput } from "./types";

export class GitHubApiClient {
    private octokit: Octokit;
    private config: GitHubConfig;

    constructor(config: GitHubConfig) {
        this.config = config;
        this.octokit = new Octokit({
            auth: config.token,
            request: {
                timeout: config.timeout,
            },
        });
    }

    async validateAccess(): Promise<void> {
        try {
            await this.octokit.repos.get({
                owner: this.config.owner,
                repo: this.config.repo,
            });
        } catch (error: any) {
            throw new Error(`Failed to access repository ${this.config.owner}/${this.config.repo}: ${error.message}`);
        }
    }

    async listFiles(path: string): Promise<RemoteFileMeta[]> {
        try {
            const response = await this.octokit.repos.getContent({
                owner: this.config.owner,
                repo: this.config.repo,
                path: path,
                ref: this.config.branch,
            });

            if (Array.isArray(response.data)) {
                return response.data.map((item: any) => ({
                    path: item.path,
                    sha: item.sha,
                    size: item.size,
                    type: item.type as "file" | "dir",
                }));
            }
            return [];
        } catch (error: any) {
            if (error.status === 404) return [];
            throw new Error(`Failed to list files at ${path}: ${error.message}`);
        }
    }

    async getFile(path: string): Promise<RemoteFileContent> {
        try {
            const response = await this.octokit.repos.getContent({
                owner: this.config.owner,
                repo: this.config.repo,
                path: path,
                ref: this.config.branch,
            });

            if ("content" in response.data && !Array.isArray(response.data)) {
                return {
                    path: response.data.path,
                    sha: response.data.sha,
                    contentBase64: response.data.content,
                };
            }
            throw new Error(`Path ${path} is not a file`);
        } catch (error: any) {
            throw new Error(`Failed to get file ${path}: ${error.message}`);
        }
    }

    async createOrUpdateFile(input: UpsertFileInput): Promise<void> {
        try {
            await this.octokit.repos.createOrUpdateFileContents({
                owner: this.config.owner,
                repo: this.config.repo,
                path: input.path,
                message: input.message,
                content: input.contentBase64,
                sha: input.sha,
                branch: this.config.branch,
            });
        } catch (error: any) {
            throw new Error(`Failed to update file ${input.path}: ${error.message}`);
        }
    }

    async deleteFile(input: DeleteFileInput): Promise<void> {
        try {
            await this.octokit.repos.deleteFile({
                owner: this.config.owner,
                repo: this.config.repo,
                path: input.path,
                message: input.message,
                sha: input.sha,
                branch: this.config.branch,
            });
        } catch (error: any) {
            throw new Error(`Failed to delete file ${input.path}: ${error.message}`);
        }
    }

    async getFileSha(path: string): Promise<string | null> {
        try {
            const response = await this.octokit.repos.getContent({
                owner: this.config.owner,
                repo: this.config.repo,
                path: path,
                ref: this.config.branch,
            });

            if (!Array.isArray(response.data)) {
                return response.data.sha;
            }
            return null;
        } catch (error: any) {
            if (error.status === 404) return null;
            throw new Error(`Failed to get SHA for ${path}: ${error.message}`);
        }
    }

    async listBranches(): Promise<BranchInfo[]> {
        try {
            const response = await this.octokit.repos.listBranches({
                owner: this.config.owner,
                repo: this.config.repo,
                per_page: 100,
            });

            const repoInfo = await this.octokit.repos.get({
                owner: this.config.owner,
                repo: this.config.repo,
            });

            const defaultBranch = repoInfo.data.default_branch;

            return response.data.map(branch => ({
                name: branch.name,
                isDefault: branch.name === defaultBranch,
                protected: branch.protected,
            }));
        } catch (error: any) {
            throw new Error(`Failed to list branches: ${error.message}`);
        }
    }

    async createBranch(input: CreateBranchInput): Promise<void> {
        try {
            const baseSha = await this.getBranchSha(input.baseBranch);
            if (!baseSha) {
                throw new Error(`Base branch ${input.baseBranch} not found`);
            }

            await this.octokit.git.createRef({
                owner: this.config.owner,
                repo: this.config.repo,
                ref: `refs/heads/${input.branchName}`,
                sha: baseSha,
            });
        } catch (error: any) {
            throw new Error(`Failed to create branch ${input.branchName}: ${error.message}`);
        }
    }

    async getBranchSha(branchName: string): Promise<string | null> {
        try {
            const response = await this.octokit.repos.getBranch({
                owner: this.config.owner,
                repo: this.config.repo,
                branch: branchName,
            });
            return response.data.commit.sha;
        } catch (error: any) {
            if (error.status === 404) return null;
            throw new Error(`Failed to get branch SHA for ${branchName}: ${error.message}`);
        }
    }

    async doesBranchExist(branchName: string): Promise<boolean> {
        try {
            await this.octokit.repos.getBranch({
                owner: this.config.owner,
                repo: this.config.repo,
                branch: branchName,
            });
            return true;
        } catch (error: any) {
            if (error.status === 404) return false;
            throw new Error(`Failed to check branch existence ${branchName}: ${error.message}`);
        }
    }

    updateCurrentBranch(branch: string): void {
        this.config.branch = branch;
    }

    getCurrentBranch(): string {
        return this.config.branch;
    }
}
