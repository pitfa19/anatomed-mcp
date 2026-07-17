import { createApp } from '../src/app.js';

// Vercel serves the Express app as a single serverless function; the catch-all
// rewrite in vercel.json routes every path here (/mcp, /widget-preview, ...).
export default createApp();
