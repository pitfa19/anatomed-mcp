import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds widget/index.html into a single self-contained dist/widget.html.
// Everything (React, R3F, three, ext-apps) is inlined — no external script
// fetches — so the MCP App iframe's block-all CSP never needs script origins;
// only GLB fetches go out (declared via _meta.ui.csp.connectDomains on the server).
export default defineConfig({
  root: 'widget',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: { entryFileNames: 'widget.js' },
    },
  },
});
