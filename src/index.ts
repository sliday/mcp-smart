#!/usr/bin/env node

import { runCli } from './cli.js';

process.exitCode = await runCli(process.argv.slice(2), process.env).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  return 1;
});
