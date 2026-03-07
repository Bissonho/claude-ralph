import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
import { UserStory } from '../ralph/types';
import { StoryItem } from '../views/stories-tree';

export async function addStory(config: RalphConfig): Promise<void> {
  const data = config.load();
  if (!data) {
    vscode.window.showErrorMessage('No Ralph project found.');
    return;
  }

  // Find next available ID
  const existingIds = data.userStories.map(s => {
    const match = s.id.match(/US-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const nextNum = Math.max(0, ...existingIds) + 1;
  const suggestedId = `US-${String(nextNum).padStart(3, '0')}`;

  const id = await vscode.window.showInputBox({
    prompt: 'Story ID',
    value: suggestedId,
    validateInput: (v) => {
      if (!v.trim()) { return 'ID is required'; }
      if (data.userStories.find(s => s.id === v)) { return 'ID already exists'; }
      return null;
    },
  });
  if (!id) { return; }

  const title = await vscode.window.showInputBox({
    prompt: 'Story title',
    placeHolder: 'e.g., Add user profile page',
  });
  if (!title) { return; }

  const description = await vscode.window.showInputBox({
    prompt: 'Description (optional)',
    placeHolder: 'As a user, I want...',
  }) || '';

  const model = await vscode.window.showQuickPick(
    ['sonnet', 'opus', 'haiku'],
    { placeHolder: 'Model' },
  ) || 'sonnet';

  const effort = await vscode.window.showQuickPick(
    ['low', 'medium', 'high'],
    { placeHolder: 'Effort' },
  ) || 'medium';

  const story: UserStory = {
    id,
    title,
    description,
    acceptanceCriteria: [],
    priority: data.userStories.length + 1,
    passes: false,
    tddType: 'frontend',
    effort,
    model,
    notes: '',
  };

  config.addStory(story);
  vscode.window.showInformationMessage(`Added ${id}: ${title}`);
}

export function markStoryDone(config: RalphConfig, item: StoryItem | { story: { id: string } }): void {
  const storyId = 'story' in item && typeof item.story === 'object'
    ? item.story.id
    : (item as StoryItem).story.id;

  config.updateStory(storyId, { passes: true });
}

export function markStoryPending(config: RalphConfig, item: StoryItem | { story: { id: string } }): void {
  const storyId = 'story' in item && typeof item.story === 'object'
    ? item.story.id
    : (item as StoryItem).story.id;

  config.updateStory(storyId, { passes: false });
}

export async function removeStory(config: RalphConfig, item: StoryItem): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Remove ${item.story.id}: ${item.story.title}?`,
    { modal: true },
    'Remove',
  );

  if (confirm === 'Remove') {
    config.removeStory(item.story.id);
    vscode.window.showInformationMessage(`Removed ${item.story.id}`);
  }
}

export async function editStory(config: RalphConfig, item: StoryItem): Promise<void> {
  // Open prd.json and jump to the story
  const uri = vscode.Uri.file(config.prdFile);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);

  const text = doc.getText();
  const storyIndex = text.indexOf(`"id": "${item.story.id}"`);
  if (storyIndex >= 0) {
    const pos = doc.positionAt(storyIndex);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
}

export function showStoryDetail(story: UserStory): void {
  const panel = vscode.window.createWebviewPanel(
    'ralph.storyDetail',
    `${story.id} — ${story.title}`,
    vscode.ViewColumn.Two,
    { enableScripts: false },
  );

  panel.webview.html = getStoryDetailHtml(story);
}

function getStoryDetailHtml(story: UserStory): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px;
    max-width: 700px;
  }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .id { font-size: 13px; color: var(--vscode-textLink-foreground); font-family: var(--vscode-editor-font-family); margin-bottom: 12px; }
  .meta { display: flex; gap: 8px; margin-bottom: 16px; }
  .tag {
    font-size: 11px; padding: 2px 8px; border-radius: 4px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  }
  .status-done { background: var(--vscode-charts-green); color: #fff; }
  .status-pending { background: var(--vscode-charts-yellow); color: #000; }
  .section { margin-bottom: 16px; }
  .section-title {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground); margin-bottom: 6px;
  }
  .description { font-size: 13px; line-height: 1.5; }
  .criteria {
    list-style: none; padding: 0;
  }
  .criteria li {
    font-size: 12px; padding: 6px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
    line-height: 1.4;
  }
  .criteria li:last-child { border-bottom: none; }
  .criteria li::before { content: "- "; color: var(--vscode-descriptionForeground); }
  .notes {
    font-size: 12px; color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBar-background);
    padding: 12px; border-radius: 6px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
</style>
</head>
<body>
  <h1>${esc(story.title)}</h1>
  <div class="id">${esc(story.id)}</div>
  <div class="meta">
    <span class="tag ${story.passes ? 'status-done' : 'status-pending'}">${story.passes ? 'Done' : 'Pending'}</span>
    <span class="tag">${story.model || 'sonnet'}</span>
    <span class="tag">${story.effort || 'medium'}</span>
    <span class="tag">P${story.priority}</span>
    <span class="tag">${story.tddType || 'frontend'}</span>
  </div>

  ${story.description ? `
    <div class="section">
      <div class="section-title">Description</div>
      <div class="description">${esc(story.description)}</div>
    </div>
  ` : ''}

  ${story.acceptanceCriteria?.length ? `
    <div class="section">
      <div class="section-title">Acceptance Criteria</div>
      <ul class="criteria">
        ${story.acceptanceCriteria.map(ac => `<li>${esc(ac)}</li>`).join('\n')}
      </ul>
    </div>
  ` : ''}

  ${story.notes ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <div class="notes">${esc(story.notes)}</div>
    </div>
  ` : ''}
</body>
</html>`;
}
