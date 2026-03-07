// MCP Server — Uses official @modelcontextprotocol/sdk
// Claude Code manages Ralph entirely through these tools
// Responses are compact (token-optimized) — structured JSON, no prose

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Config } from '../core/config.js';
import { getCompactStatus } from '../commands/status.js';
import { findPrdDir } from '../utils.js';

// --- MCP Tool Definitions ---

const TOOLS = [
  {
    name: 'ralph_status',
    description: 'Get Ralph loop progress. Returns compact JSON: project, branch, progress fraction, pending count, next story, and story list with done/pending status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ralph_list_stories',
    description: 'List stories. Filter: all (default), pending, done.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'pending', 'done'], default: 'all' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'ralph_add_story',
    description: 'Add a user story to prd.json.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Story ID (e.g. US-005)' },
        title: { type: 'string' },
        description: { type: 'string' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        priority: { type: 'number' },
        effort: { type: 'string', enum: ['low', 'medium', 'high'] },
        model: { type: 'string' },
        notes: { type: 'string' },
        tddType: { type: 'string', enum: ['testable', 'scaffold', 'frontend', 'infra'] },
        research: { type: 'boolean' },
        research_query: { type: 'string' },
      },
      required: ['id', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'ralph_update_story',
    description: 'Update fields of an existing story.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Story ID to update' },
        title: { type: 'string' },
        description: { type: 'string' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        priority: { type: 'number' },
        passes: { type: 'boolean' },
        effort: { type: 'string' },
        model: { type: 'string' },
        notes: { type: 'string' },
        tddType: { type: 'string' },
        research: { type: 'boolean' },
        research_query: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'ralph_reorder_stories',
    description: 'Reorder story priorities. Pass an array of story IDs in the desired execution order.',
    inputSchema: {
      type: 'object',
      properties: {
        order: {
          type: 'array',
          items: { type: 'string' },
          description: 'Story IDs in desired execution order',
        },
      },
      required: ['order'],
      additionalProperties: false,
    },
  },
  {
    name: 'ralph_remove_story',
    description: 'Remove a story from prd.json.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Story ID to remove' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'ralph_add_context',
    description: 'Add a codebase pattern or context note to progress.txt.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Pattern or context to add' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'ralph_start',
    description: 'Start the Ralph loop. Runs in background. Check status with ralph_status.',
    inputSchema: {
      type: 'object',
      properties: {
        maxIterations: { type: 'number', default: 30 },
        tool: { type: 'string', enum: ['claude', 'amp'], default: 'claude' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'ralph_init',
    description: 'Initialize .ralph/ in the current project with auto-detected quality checks.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ralph_check_prd',
    description: 'Check if a PRD already exists and its state. ALWAYS call this BEFORE creating stories or a new PRD.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ralph_archive',
    description: 'Archive the current PRD and reset for a new one. Codebase Patterns are carried forward.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ralph_create_prd',
    description: 'Create a new prd.json with full PRD data. Use after ralph_archive or when state is "empty".',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        branchName: { type: 'string', description: 'Git branch name' },
        description: { type: 'string', description: 'Project/feature description' },
        qualityChecks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              command: { type: 'string' },
            },
            required: ['name', 'command'],
          },
        },
        userStories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              acceptanceCriteria: { type: 'array', items: { type: 'string' } },
              priority: { type: 'number' },
              tddType: { type: 'string' },
              effort: { type: 'string' },
              model: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['id', 'title'],
          },
        },
      },
      required: ['project', 'branchName', 'userStories'],
      additionalProperties: false,
    },
  },
];

// --- Tool Handlers ---

function getConfig() {
  const prdDir = findPrdDir();
  return new Config(prdDir);
}

async function handleTool(name, args) {
  switch (name) {
    case 'ralph_status': {
      const config = getConfig();
      return getCompactStatus(config);
    }

    case 'ralph_list_stories': {
      const config = getConfig();
      const data = config.load();
      const filter = args.filter || 'all';
      let stories = data.userStories;
      if (filter === 'pending') stories = stories.filter((s) => !s.passes);
      if (filter === 'done') stories = stories.filter((s) => s.passes);
      return stories.map((s) => ({
        id: s.id,
        title: s.title,
        done: s.passes,
        priority: s.priority,
        model: s.model,
        effort: s.effort,
      }));
    }

    case 'ralph_add_story': {
      const config = getConfig();
      config.addStory(args);
      return { ok: true, id: args.id };
    }

    case 'ralph_update_story': {
      const { id, ...updates } = args;
      const config = getConfig();
      config.updateStory(id, updates);
      return { ok: true, id };
    }

    case 'ralph_reorder_stories': {
      const config = getConfig();
      const data = config.load();
      const order = args.order;

      const storyIds = new Set(data.userStories.map((s) => s.id));
      const missing = order.filter((id) => !storyIds.has(id));
      if (missing.length > 0) {
        return { ok: false, message: `Stories not found: ${missing.join(', ')}` };
      }

      let priority = 1;
      for (const id of order) {
        const story = data.userStories.find((s) => s.id === id);
        if (story) { story.priority = priority++; }
      }

      const orderedSet = new Set(order);
      const remaining = data.userStories
        .filter((s) => !orderedSet.has(s.id))
        .sort((a, b) => (a.priority || 999) - (b.priority || 999));
      for (const story of remaining) {
        story.priority = priority++;
      }

      config.save(data);
      return {
        ok: true,
        order: data.userStories
          .sort((a, b) => a.priority - b.priority)
          .map((s) => ({ id: s.id, priority: s.priority, title: s.title })),
      };
    }

    case 'ralph_remove_story': {
      const config = getConfig();
      config.removeStory(args.id);
      return { ok: true, id: args.id };
    }

    case 'ralph_add_context': {
      const config = getConfig();
      const progress = config.readProgress();
      const patternLine = `- ${args.pattern}`;

      if (progress.includes('## Codebase Patterns')) {
        const updated = progress.replace(
          '## Codebase Patterns\n',
          `## Codebase Patterns\n${patternLine}\n`
        );
        const { writeFileSync } = await import('fs');
        writeFileSync(config.progressFile, updated);
      } else {
        config.appendProgress(`## Codebase Patterns\n${patternLine}`);
      }
      return { ok: true, pattern: args.pattern };
    }

    case 'ralph_start': {
      const { spawn } = await import('child_process');
      const maxIter = args.maxIterations || 30;
      const toolArg = args.tool || 'claude';

      const child = spawn('ralph', ['run', '--max-iterations', String(maxIter), '--tool', toolArg], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      });
      child.unref();

      return { ok: true, pid: child.pid, maxIterations: maxIter, tool: toolArg };
    }

    case 'ralph_init': {
      const { init } = await import('../commands/init.js');
      await init();
      return { ok: true };
    }

    case 'ralph_check_prd': {
      const config = getConfig();
      const state = config.getPrdState();
      if (state === 'empty') {
        return { state: 'empty', message: 'No PRD exists. Create one with ralph_create_prd.' };
      }
      const summary = config.getPrdSummary();
      if (state === 'complete') {
        return {
          state: 'complete', ...summary,
          message: `PRD "${summary.project}" is COMPLETE (${summary.total}/${summary.total} done). Ask: archive and start new, or add more stories?`,
        };
      }
      return {
        state: 'pending', ...summary,
        message: `PRD "${summary.project}" IN PROGRESS (${summary.done}/${summary.total} done). Ask: add stories, or archive and start fresh?`,
      };
    }

    case 'ralph_archive': {
      const config = getConfig();
      if (config.getPrdState() === 'empty') {
        return { ok: false, message: 'No PRD to archive.' };
      }
      const result = config.archiveCurrent();
      return { ok: true, ...result };
    }

    case 'ralph_create_prd': {
      const config = getConfig();
      const state = config.getPrdState();
      if (state !== 'empty') {
        const summary = config.getPrdSummary();
        return {
          ok: false, state, ...summary,
          message: `PRD already exists. Call ralph_archive first, or use ralph_add_story.`,
        };
      }
      const prdData = {
        project: args.project,
        branchName: args.branchName,
        description: args.description || '',
        qualityChecks: args.qualityChecks || [],
        userStories: (args.userStories || []).map((s, i) => ({
          id: s.id,
          title: s.title,
          description: s.description || '',
          acceptanceCriteria: s.acceptanceCriteria || [],
          priority: s.priority || i + 1,
          passes: false,
          tddType: s.tddType || 'frontend',
          effort: s.effort || 'medium',
          model: s.model || 'sonnet',
          notes: s.notes || '',
        })),
      };
      const result = config.createPrd(prdData);
      return { ok: true, ...result };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- MCP Server ---

export async function startMcpServer() {
  const server = new Server(
    { name: 'ralph', version: '1.0.0' },
    { capabilities: { tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handleTool(name, args || {});
      return {
        content: [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result),
        }],
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
