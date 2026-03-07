#!/usr/bin/env node

import { cli } from '../src/cli.js';

cli(process.argv.slice(2)).catch((err) => {
  console.error(`\x1b[31mFatal: ${err.message}\x1b[0m`);
  process.exit(1);
});
