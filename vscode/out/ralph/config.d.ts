import { PrdData, Progress, StatusInfo, UserStory, GlobalConfig, WorktreeInfo } from './types';
export declare class RalphConfig {
    readonly prdDir: string;
    readonly prdFile: string;
    readonly statusFile: string;
    readonly progressFile: string;
    readonly lockFile: string;
    readonly configFile: string;
    readonly worktreesFile: string;
    constructor(prdDir: string);
    exists(): boolean;
    load(): PrdData | null;
    save(data: PrdData): void;
    getProgress(data: PrdData): Progress;
    getNextStory(data: PrdData): UserStory | null;
    isStatusFileStale(): boolean;
    isLockFilePresent(): boolean;
    readStatus(): StatusInfo | null;
    private isActuallyRunning;
    clearRunningStatus(): void;
    readProgressLog(): string;
    updateStory(storyId: string, updates: Partial<UserStory>): void;
    addStory(story: UserStory): void;
    reorderStory(storyId: string, newPriority: number): void;
    removeStory(storyId: string): void;
    getPrdState(): 'empty' | 'pending' | 'complete';
    archiveCurrent(): {
        archivedTo: string;
        project: string;
    } | null;
    loadGlobalConfig(): GlobalConfig;
    saveGlobalConfig(data: GlobalConfig): void;
    loadWorktrees(): WorktreeInfo[];
    private enrichWorktreeEntry;
    private parseStatus;
}
export declare function findPrdDir(workspaceRoot: string): string | null;
//# sourceMappingURL=config.d.ts.map