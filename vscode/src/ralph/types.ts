export interface QualityCheck {
  name: string;
  command: string;
}

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  tddType: string;
  effort: string;
  model: string;
  notes: string;
  research?: boolean;
  research_query?: string;
  research_model?: string;
}

export interface PrdData {
  project: string;
  branchName: string;
  description: string;
  qualityChecks: QualityCheck[];
  userStories: UserStory[];
}

export interface Progress {
  total: number;
  done: number;
  pending: number;
  pct: number;
}

export interface StatusInfo {
  done: number;
  total: number;
  pct: number;
  storyId: string | null;
  status: string;
  iteration: number;
  maxIterations: number;
  time: string;
  raw: string;
}
