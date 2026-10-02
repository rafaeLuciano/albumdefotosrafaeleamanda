# Álbum Amanda & Rafael

Site 100% frontend (HTML/CSS/JS). Senha: definida em `site/app.js` (`PASSWORD`).

## Passo a passo
1. Extraia o ZIP das fotos dentro da pasta `fotos/` (pode ter subpastas).
2. `npm install` (uma vez) e depois `npm run fotos`
   - gera miniaturas + versão 2048px de cada foto em `site/gallery/` e o `manifest.json`
   - ajustes: `npm run fotos -- --max=2400 --quality=85`
3. Teste local: `npm run dev` → http://localhost:3000
4. Deploy: publique a pasta **`site/`** (Cloudflare Pages, Netlify, Vercel...). Sem build command.

## Onde mexer
- Foto da capa: `site/assets/capa.jpg`
- Senha / prefixo dos arquivos: topo de `site/app.js`
- Tamanho do retângulo, transição, texto do vídeo: `VIDEO` no topo de `site/video.js`
