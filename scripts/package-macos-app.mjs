#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const appRoot = path.join(projectRoot, 'dist', 'OpenClawDeploy.app');
const contents = path.join(appRoot, 'Contents');
const macOSDir = path.join(contents, 'MacOS');
const resourcesDir = path.join(contents, 'Resources');

fs.rmSync(appRoot, { recursive: true, force: true });
fs.mkdirSync(macOSDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleDisplayName</key>
    <string>OpenClawDeploy</string>
    <key>CFBundleExecutable</key>
    <string>OpenClawDeploy</string>
    <key>CFBundleIdentifier</key>
    <string>ai.openclaw.deploy.gui</string>
    <key>CFBundleName</key>
    <string>OpenClawDeploy</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.3.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
  </dict>
</plist>
`;

const launcher = `#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
exec node "$APP_ROOT/scripts/gui.mjs"
`;

fs.writeFileSync(path.join(contents, 'Info.plist'), plist, 'utf8');
fs.writeFileSync(path.join(macOSDir, 'OpenClawDeploy'), launcher, 'utf8');
fs.chmodSync(path.join(macOSDir, 'OpenClawDeploy'), 0o755);

console.log(`Created: ${appRoot}`);
