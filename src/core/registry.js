import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class GlobalRegistry {
  constructor(homeDir) {
    this._home = homeDir ?? (process.env.RALPH_TEST_HOME || os.homedir());
    this._dir = join(this._home, '.ralph');
    this._file = join(this._dir, 'registry.json');
  }

  _read() {
    mkdirSync(this._dir, { recursive: true });
    if (!existsSync(this._file)) return [];
    try {
      return JSON.parse(readFileSync(this._file, 'utf8'));
    } catch {
      return [];
    }
  }

  _write(entries) {
    mkdirSync(this._dir, { recursive: true });
    writeFileSync(this._file, JSON.stringify(entries, null, 2));
  }

  register(entry) {
    const entries = this._read();
    entries.push(entry);
    this._write(entries);
  }

  deregister(pid) {
    const entries = this._read().filter((e) => e.pid !== pid);
    this._write(entries);
  }

  list() {
    return this._read().filter((e) => isAlive(e.pid));
  }

  prune() {
    const entries = this._read().filter((e) => isAlive(e.pid));
    this._write(entries);
  }
}
