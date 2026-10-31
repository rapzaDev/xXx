# Dojo Atlas

Catálogo de vídeos com coleção e favoritos locais ao navegador.

Execute `npm start` e abra http://localhost:4173. `npm test` valida catálogo e resolução de mídia; `npm run build` gera o Worker ESM em `dist/server/index.js`.

A interface e o catálogo inicial ficam em `public/`. O build incorpora os arquivos no Worker, que serve a interface e `POST /api/resolve`. Sem dependências npm; a biblioteca HLS.js 1.6.13 está incluída em `public/vendor/`, com licença Apache 2.0.

Ao abrir um cartão, o player inicia diretamente para YouTube/Vimeo/XVideos e arquivos HTTPS de vídeo, incluindo HLS. Para links de páginas de qualquer domínio público, o servidor procura vídeos em HTML5, Open Graph, Twitter Player, JSON-LD VideoObject e configurações comuns de players. Também reconhece iframes pelo identificador do player, códigos de incorporação publicados em campos de compartilhamento e endereços literais como `video_embed`, mesmo quando o iframe inicial usa `about:blank`. Quando há alternativas, o visitante pode trocar entre Player 1, Player 2 etc. O resolvedor aplica limites de tamanho, tempo e redirecionamentos. URLs de reprodução identificadas não são gravadas no catálogo: são consultadas novamente ao abrir a ficha para reduzir problemas com links temporários. Favoritos e registros existentes mantêm as mesmas chaves de armazenamento.

Não há garantia universal de reprodução: login, DRM, bloqueios de incorporação/CORS, georrestrições, formatos incompatíveis e páginas que só expõem o vídeo após executar JavaScript podem exigir assistir na origem. A aplicação não contorna essas restrições, não executa os scripts da página no servidor e não faz proxy nem download dos vídeos. `Configurar reprodução` permite indicar outro link ou arquivo sem alterar a fonte original.

Leia [o manual](docs/MANUAL-DE-INDEXACAO.md) e [a especificação](docs/ESPECIFICACAO-MVP.md). Para regenerar a documentação HTML, execute `python3 scripts/render_docs.py`.
