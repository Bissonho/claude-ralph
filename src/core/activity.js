import { mkdirSync, appendFileSync, writeFileSync, readFileSync, createWriteStream, existsSync } from 'fs';
import { join } from 'path';

export class ActivityLogger {
  constructor(prdDir) {
    this._prdDir = prdDir;
    this._activityFile = join(prdDir, 'activity.jsonl');
    this._logsDir = join(prdDir, 'logs');
    mkdirSync(this._logsDir, { recursive: true });
  }

  emit(event) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    appendFileSync(this._activityFile, line, 'utf8');
  }

  startStoryLog(storyId) {
    const logFile = join(this._logsDir, `${storyId}.log`);
    return createWriteStream(logFile, { flags: 'w' });
  }

  appendStoryLog(storyId, chunk) {
    const logFile = join(this._logsDir, `${storyId}.log`);
    return new Promise((resolve, reject) => {
      try {
        appendFileSync(logFile, chunk, 'utf8');
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  readStoryLog(storyId) {
    const logFile = join(this._logsDir, `${storyId}.log`);
    if (!existsSync(logFile)) return '';
    return readFileSync(logFile, 'utf8');
  }

  readActivity(limit) {
    if (!existsSync(this._activityFile)) return [];
    const content = readFileSync(this._activityFile, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const tail = limit != null ? lines.slice(-limit) : lines;
    return tail.map(line => JSON.parse(line));
  }

  clear() {
    writeFileSync(this._activityFile, '', 'utf8');
  }
}
