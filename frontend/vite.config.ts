import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Controle Financeiro',
        short_name: 'Finanças',
        description: 'Controle de gastos, contas fixas e parcelas',
        theme_color: '#1F6F5C',
        background_color: '#F0EFE9',
        display: 'standalone',
        // TODO: adicionar icon-192.png e icon-512.png em public/ antes de instalar como PWA de verdade
        icons: [],
      },
    }),
  ],
})
