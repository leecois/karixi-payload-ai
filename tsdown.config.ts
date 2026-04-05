import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  deps: {
    neverBundle: ['payload', 'react', 'react-dom', '@payloadcms/plugin-mcp'],
  },
})
