import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{const env=loadEnv(mode,'.','');const target=env.API_PROXY_TARGET||'http://127.0.0.1:8188';return { plugins:[react()], server:{port:5173,proxy:{'/api':{target,ws:true},'/media':target}}, build:{outDir:'dist',emptyOutDir:true} };});
