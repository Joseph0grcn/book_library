import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        legacy: 'index.html',
        react: 'react.html'
      }
    }
  }
});
