import { RalphConfig } from '../ralph/config';
import { UserStory } from '../ralph/types';
import { StoryItem } from '../views/stories-tree';
export declare function addStory(config: RalphConfig): Promise<void>;
export declare function markStoryDone(config: RalphConfig, item: StoryItem | {
    story: {
        id: string;
    };
}): void;
export declare function markStoryPending(config: RalphConfig, item: StoryItem | {
    story: {
        id: string;
    };
}): void;
export declare function removeStory(config: RalphConfig, item: StoryItem): Promise<void>;
export declare function editStory(config: RalphConfig, item: StoryItem): Promise<void>;
export declare function showStoryDetail(story: UserStory): void;
//# sourceMappingURL=stories.d.ts.map