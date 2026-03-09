#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverProvidersLocal, discoverSkillsLocal } from './discovery.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'catalog');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'providers.json'), JSON.stringify(discoverProvidersLocal(projectRoot), null, 2));
fs.writeFileSync(path.join(outDir, 'skills.json'), JSON.stringify(discoverSkillsLocal('~/.openclaw/workspace', projectRoot), null, 2));
console.log(`Catalog written to ${outDir}`);
