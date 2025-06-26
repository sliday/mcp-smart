#!/usr/bin/env node

import { SmartAdvisorServer } from './SmartAdvisorServer.js';

const server = new SmartAdvisorServer();
server.run().catch(console.error);