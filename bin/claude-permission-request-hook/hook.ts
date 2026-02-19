#!/usr/bin/env node

import { main } from './lib.ts';

// Kill switch
if (process.env.CLAUDE_GLOBAL_PERMISSION_REQUEST_HOOK_DISABLE === '1') {
  process.exit(0);
}

main();
