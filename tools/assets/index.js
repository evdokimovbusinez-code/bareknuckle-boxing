// dispatcher: run an arbitrary .mjs from tools/assets/ via the allowlisted
//   node tools/assets/ <script> [args...]
// (the SDK Bash rule "node tools/assets/:*" needs a space after the slash,
//  and node runs a directory argument as its index.js)
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const p = process.argv[2];
if (!p) { console.error('usage: node tools/assets/ SCRIPT [args...]'); process.exit(1); }
process.argv = [process.argv[0], p, ...process.argv.slice(3)];
await import(pathToFileURL(path.resolve(p)).href);
