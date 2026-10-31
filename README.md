# Dojo Atlas

Catálogo local com coleta automática de categorias e vídeos, busca por título, filtros por fonte/categoria e reprodução incorporada.

## Executar

Requer Node.js 22.23 ou mais recente, em uma versão compatível com `package.json`.

```sh
npm ci
npm start
```

Abra **http://localhost:4173**. A coleta começa junto com o servidor e é repetida a cada seis horas enquanto o processo estiver aberto. A interface mostra progresso, resultados e eventuais falhas por fonte. `Ctrl+C` encerra o programa; o progresso permanece salvo.

O processo usa seu Mac e um banco SQLite em `.data/catalog.sqlite`. Não exige chave de IA, serviço de banco remoto ou GitHub Actions. Metadados, fila e banco não são enviados ao GitHub. Os arquivos originais permanecem nas fontes. As miniaturas são entregues por uma rota local para evitar falhas de carregamento externo. Links expirados são renovados a partir da página do vídeo; o navegador pode reutilizar a imagem por uma hora, sem armazenar arquivos de preview no projeto. Para o xHamster, o servidor local resolve as referências MP4 públicas e repassa o streaming ao elemento de vídeo, preservando solicitações de intervalo para avanço e retrocesso. Esse repasse não grava o vídeo em disco ou no SQLite. Sessões de reprodução são temporárias, em memória.

## Fontes e limites

Edite [`config/sources.json`](config/sources.json). XVideos, xHamster e Pornhub estão configurados com adaptadores separados. A lista é lida pelo processo local; não existe formulário público para cadastrar fontes.

- Nomes de categorias iguais, desconsiderando maiúsculas e espaços extras, são unidos. Nomes diferentes permanecem separados.
- Cada vídeo pode pertencer a várias categorias, com uma única ficha por identificador e fonte.
- Cada execução consulta até 25 páginas por fonte, com teto de 100 páginas por fonte/dia. Esses valores controlam o ritmo, não o tamanho final do catálogo.
- A fila alterna descoberta, páginas iniciais atualizadas e exploração progressiva do histórico. O ponto de retomada fica no SQLite.
- Falhas transitórias têm tentativas limitadas e espera; restrições de acesso são exibidas. A coleta respeita `robots.txt`, mantém requisições no domínio configurado e não executa scripts das páginas.
- Uma nova fonte exige um adaptador compatível com a estrutura dela; adicionar uma URL não cria suporte universal automaticamente.

## Comandos

```sh
npm run collect          # uma execução; funciona mesmo com o site fechado
npm run collect:watch    # processo de coleta que repete a cada seis horas
npm test                # testes com fontes simuladas e banco temporário
npm run build           # gera o artefato da interface e resolução de players
```

`npm start` já inclui o agendamento: não é necessário abrir um segundo coletor. Uma trava no SQLite impede coletas concorrentes. `DOJO_AUTO_COLLECT=0 npm start` inicia somente o site. `PORT=4174 npm start` muda a porta.

## Dados e backups

O catálogo, cadastros manuais e progresso ficam no SQLite. Somente favoritos e preferências ficam no navegador, já que esta versão não possui contas. Cadastros antigos no localStorage do mesmo endereço local são migrados automaticamente após validação.

A interface exporta e importa JSON (até 10.000 registros e 2 MB por importação). Para backup integral de uma coleção maior, encerre os processos e copie a pasta `.data/`. Essa pasta está no `.gitignore`.

A busca é feita no servidor com FTS5, filtros combinados e paginação. O navegador recebe até 40 fichas por página, sem carregar o catálogo inteiro. A ordem padrão usa a entrada já registrada no SQLite: novos vídeos entram no fim da sequência e novas associações entram no fim da categoria correspondente. Não é gravada outra lista ou cache de ordenação. Atualizações de coleta preservam os cartões e imagens existentes e preenchem somente os espaços livres; páginas completas consultam apenas os contadores. A ordenação por título continua disponível por escolha do visitante.

## Estrutura

- `config/`: fontes e limites versionados.
- `local/`: banco, fila, adaptadores, rede, coletor e API local.
- `public/`: interface, player e documentação.
- `worker/`: resolvedor de mídia e empacotamento anterior.
- `scripts/`: execução, coleta e build.
- `tests/`: testes de catálogo, player, adaptadores, persistência, fila, API e interface.

Esta etapa é local. O build anterior de Worker não fornece a API SQLite local em nuvem. A migração para produção deverá conectar banco hospedado, execução agendada e as políticas de acesso correspondentes, antes de publicar a nova interface. O repasse de streaming também precisará ser dimensionado por banda e conexões, pois nesta etapa ele é executado no Mac.

Consulte o [manual de coleta](docs/MANUAL-DE-INDEXACAO.md). Para atualizar sua versão HTML, execute `python3 scripts/render_docs.py`.
