import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'ws', /^node:/],
    },
    sourcemap: true,
    target: 'node22',
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
