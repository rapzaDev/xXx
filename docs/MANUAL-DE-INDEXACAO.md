# Manual de indexação — Dojo Atlas

Versão 2 · 30 de outubro de 2026

## 1. O que você recebeu

Um MVP de curadoria de vídeos não explícitos de artes marciais e tendências. Você pode cadastrar links HTTP e HTTPS de qualquer site, buscar por título, criador e nota editorial, filtrar modalidade e nível, favoritar, importar e exportar registros JSON. Ao abrir um cartão, a reprodução é preparada automaticamente: player oficial para fontes reconhecidas, elemento de vídeo para arquivos diretos e busca de metadados para páginas de qualquer domínio público. O site não exibe páginas inteiras na área do player.

O catálogo inicial está vazio. Não existem números inventados de audiência nem vídeos fictícios. As ilustrações da página são editoriais. O nome Dojo Atlas é uma proposta de trabalho; disponibilidade de marca e domínio ainda não foi verificada.

Edições e favoritos são locais ao navegador e à origem do site. Eles não sincronizam entre computadores. Janela privada, limpeza de dados ou troca de endereço podem apagar ou separar sua coleção. Exporte backups. O arquivo public/catalog.json pode fornecer o catálogo inicial compartilhado numa próxima publicação; edições locais existentes têm precedência. Restaurar o catálogo inicial apaga essas edições, após confirmação.

## 2. Indexar, incorporar e hospedar são operações diferentes

Indexar é manter uma ficha: título, criador, categoria, identificador e link de origem. Incorporar é abrir um player fornecido pela plataforma. Hospedar é armazenar e distribuir o arquivo de vídeo.

Este MVP faz as duas primeiras operações para fontes suportadas. Ele busca endereços de mídia publicados pela página, sem hospedar os arquivos ou remover anúncios e marcas do player. Não existe um método universal autorizado para indexar qualquer vídeo: cada fonte tem permissões, documentação e limitações próprias.

Uma URL pública não concede automaticamente uma licença para copiar arquivos ou miniaturas. Permissão de incorporação também não equivale a permissão para download, redistribuição ou uso comercial irrestrito. Registre a base aplicável e observe as condições da plataforma.

## 3. Seu primeiro cadastro: passo a passo

1. Escolha um vídeo adequado ao tema no canal do próprio criador ou em outra fonte que você tenha autorização para utilizar.
2. Abra a função oficial de compartilhar/incorporar da plataforma. Verifique se ela está disponível e teste o player. Não trate uma opção indisponível como um problema a contornar.
3. No Dojo Atlas, clique em Adicionar vídeo.
4. Cole o endereço HTTP ou HTTPS completo da página ou do vídeo. Ao abrir o cartão, o app reconhece players oficiais de YouTube/Vimeo/XVideos, arquivos HTTPS de vídeo e playlists HLS. Para outras páginas públicas, o servidor procura o vídeo ou player publicado pela origem, sem exigir um endereço de reprodução separado.
5. Informe título e criador corretamente. Escolha modalidade e nível e escreva uma nota editorial própria.
6. Registre a base da permissão: por exemplo, player oficial habilitado e testado, com referência a autorização adicional se houver. Não marque confirmação sem verificar.
7. Salve e abra o cartão: o player é carregado automaticamente. O navegador pode exigir pressionar ▶ para iniciar o som. Se a origem não disponibilizar um recurso reproduzível, use Abrir na fonte ou Configurar reprodução para indicar outro endereço.
8. Se houver bloqueio, use Abrir na fonte ou retire o registro. A aplicação não comprova a disponibilidade do vídeo só porque aceita sua URL.
9. Exporte JSON para guardar um backup.

Sugestão editorial: comece com 15 a 30 vídeos bem revisados, distribuídos entre fundamentos, técnica, estratégia e contexto esportivo. A coleção de tendências deve ter seleção editorial datada; este MVP não identifica tendências automaticamente.

## 4. Como funciona a ficha de um vídeo

playbackUrl é um campo opcional, separado de sourceUrl, para indicar o vídeo individual compatível ou arquivo direto sem perder a página de origem. Os campos obrigatórios são sourceUrl, title, author, category, level, permissionConfirmed, permissionNote e checkedAt. O sistema gera identificador, provedor e URL de incorporação a partir da fonte; ele não confia num iframe fornecido pelo arquivo importado. O tipo também é recalculado; o JSON não pode forçar uma incorporação oficial.

category aceita Jiu-jítsu, Judô, Boxe, Muay Thai, MMA, Karate ou Tendências. level aceita Iniciante, Intermediário, Avançado ou Todos. checkedAt é a data real de revisão em formato ISO 8601. description contém uma nota editorial de até 2.000 caracteres.

O exemplo abaixo é apenas um registro técnico de demonstração da documentação do YouTube, não um vídeo de artes marciais aprovado para seu catálogo. Não importe exemplos sem revisar o conteúdo e atualizar a data com uma verificação real.

```json
[
  {
    "sourceUrl": "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    "title": "Demonstração técnica da API de player",
    "author": "YouTube Developers",
    "category": "Tendências",
    "level": "Todos",
    "description": "Exemplo técnico para entender o formato; revisar antes de publicar.",
    "permissionConfirmed": true,
    "permissionNote": "Exemplo documental; substituir por uma verificação real da fonte.",
    "checkedAt": "2026-10-30T12:00:00Z"
  }
]
```

## 5. Importar e exportar em lote

Use Exportar JSON para obter registros já no formato aceito. Edite uma cópia e mantenha o original como backup. Importar JSON aceita um array com até 1.000 registros e arquivo de até 5 MB. Todos os registros são validados antes da alteração. Se um for inválido, a importação inteira é cancelada.

Duplicados internos ao arquivo são rejeitados. Ao combinar com seu catálogo, registros que já existem são preservados; importar não atualiza suas fichas antigas. Para atualizar uma ficha, abra o cartão e use Configurar reprodução; os demais campos também podem ser editados. IDs iguais são tratados como o mesmo vídeo, mesmo quando o link usa um formato diferente.

Para distribuir uma seleção inicial, coloque o array revisado em public/catalog.json e republique. Isso não transforma o formulário local em um painel administrativo global. Novos visitantes recebem a seleção inicial; visitantes com edições locais mantêm suas cópias.

## 6. APIs oficiais: como automatizar a coleta de metadados

Este fluxo é uma especificação para a próxima etapa; não está conectado no MVP atual.

Para o YouTube, use a YouTube Data API. search.list pode localizar vídeos usando type=video e videoEmbeddable=true. Para canais conhecidos, é preferível obter a playlist de uploads e ler seus itens. videos.list permite consultar metadados e status de uma lista de identificadores. As cotas variam conforme a operação e o projeto: consulte a documentação antes de estimar volume.

Fluxo recomendado: fonte previamente aprovada → IDs → metadados pela API → verificação de status → fila de revisão editorial → publicação. Armazene a chave no servidor, configure restrições e orçamento/cota, e não a coloque no JavaScript ou no JSON público. O MVP atual não exige chave de API.

Confira status.embeddable, privacyStatus e restrições regionais aplicáveis, além de testar o player. Esse status não é um parecer sobre titularidade nem garantia de reprodução para todos os visitantes. Disponibilidade pode mudar após a importação.

Mantenha os dados de API atualizados conforme as políticas vigentes. As políticas do YouTube incluem exigências de atualização/exclusão de dados armazenados em períodos de 30 dias, com distinções entre tipos de dados e autorização. Planeje revisão frequente e aplique as condições específicas à sua integração. O aviso de revisão deste MVP é um lembrete local; não consulta a API nem garante conformidade sozinho.

Documentação oficial:

- https://developers.google.com/youtube/data/reference/rest/v3/search/list
- https://developers.google.com/youtube/data/reference/rest/v3/videos/list
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/player_parameters
- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/terms/developer-policies-guide

## 7. Feeds e outras plataformas

Um feed pode servir para descobrir links e datas; a existência dele não autoriza copiar o conteúdo completo. Antes de integrar uma nova fonte, identifique a documentação oficial, os campos permitidos, limites de requisições, autorização, identificação do autor, requisitos de atualização e mecanismo de remoção.

O MVP aceita links de qualquer domínio público e identifica automaticamente metadados de vídeo em HTML5, Open Graph, Twitter Player, JSON-LD e configurações comuns de players. Não importa catálogos RSS ou oEmbed. O resolvedor limita tempo, tamanho e redirecionamentos; não executa scripts da página nem acessa sessões de login.

Nunca aceite iframe ou HTML arbitrário vindo de feeds. Gere a incorporação por um adaptador conhecido. Se um servidor futuro buscar URLs fornecidas por usuários, bloqueie endereços internos, localhost, credenciais, portas inadequadas e redirecionamentos fora da lista permitida; aplique limites de tamanho e tempo e proteção contra SSRF.

## 8. Revisar e remover

Revise título, autor, disponibilidade e permissão periodicamente. Guarde a data e a base da revisão. Este MVP sinaliza registros com mais de 30 dias para revisão, mas não atualiza metadados ou permissões automaticamente.

Para remover uma ficha, abra o vídeo e use Remover do catálogo. Isso afeta apenas sua coleção local, não o original. Para um catálogo compartilhado, remova também o registro do arquivo inicial e publique novamente. Em produção, crie um canal real de solicitações e uma lista de exclusão para evitar reimportação de conteúdos removidos.

## 9. Indexação pelo Google é outra etapa

Importar vídeos no catálogo não equivale a indexar suas páginas em buscadores. O MVP atual é uma aplicação estática com filtros no cliente e detalhes em diálogos; não cria uma URL HTML indexável por vídeo.

Na próxima etapa, gere páginas estáveis como /videos/slug-id com conteúdo editorial original, fonte atribuída, metadados corretos e renderização no servidor ou geração estática. Crie sitemap, canonical e dados estruturados VideoObject somente com dados reais e disponíveis. A miniatura exige permissão de uso. Não invente data, duração ou popularidade. Configurar SEO não garante inclusão ou destaque em resultados de vídeo.

Referências oficiais para essa etapa:

- https://developers.google.com/search/docs/appearance/video
- https://developers.google.com/search/docs/appearance/structured-data/video

## 10. Critérios para integrar uma fonte nova

Antes de programar, responda: a fonte permite a integração pretendida? Há API/feed/player oficial? Quem é o autor? Quais dados podem ser armazenados e por quanto tempo? O player exige domínio autorizado? Como detectar exclusão? Como processar pedidos de remoção? Qual o limite de consultas? Se a resposta essencial estiver ausente, mantenha a fonte fora da automação até esclarecer.

## 11. Operação do projeto

Abra um terminal na pasta dojo-atlas e execute npm start. Acesse http://localhost:4173. Para os testes, execute npm test. Não abra index.html por file://: módulos e leitura de catálogo dependem de HTTP.

Arquivos: public/index.html é a interface, public/app.js contém as interações, public/player.js controla a reprodução, public/catalog.js valida os registros, public/style.css define o visual e public/catalog.json guarda a seleção inicial. worker/resolver.js identifica mídia nas páginas. A biblioteca HLS.js está incluída em public/vendor/ com sua licença. Abrir um cartão inicia a consulta e o carregamento externo.

## 12. Limites e próximos passos

A edição local é funcional, mas não substitui um produto multiusuário. Antes de abrir contribuições públicas, implemente autenticação e permissões no servidor, banco de dados compartilhado, revisão editorial, prevenção de spam, rate limits, rotinas de atualização, backups, logs e tratamento de remoções. Não chame o formulário local de painel administrativo protegido.

O próximo documento, ESPECIFICACAO-MVP.md, detalha essa evolução. Não há publicidade, aquisição automática, recomendação por IA, importação universal ou analytics conectados nesta versão.


## 13. Reprodução automática de links

A página de origem e o endereço de reprodução são separados. Links do XVideos nos formatos video.ID, video123 e embedframe/ID são convertidos diretamente no player do provedor, preservando registros e favoritos. Ao abrir a ficha, o app carrega players reconhecidos e vídeos diretos ou consulta o resolvedor para identificar mídia publicada pela página. Vídeos HTML5, metadados Open Graph, Twitter Player, JSON-LD VideoObject e configurações comuns de players são reconhecidos. Também são reconhecidos iframes identificados como player, códigos de incorporação publicados no compartilhamento e endereços literais de player em scripts, inclusive quando o iframe começa vazio. Quando há mais de uma opção, os botões Player 1, Player 2 etc. permitem alternar sem sair da ficha. Streams HLS usam suporte nativo do Safari ou HLS.js nos navegadores compatíveis.

O processo também se aplica aos registros já cadastrados; não é necessário apagá-los ou adicioná-los novamente. A identificação é refeita ao abrir a ficha para lidar com URLs temporárias. Configurar reprodução continua disponível para indicar outro link ou arquivo HTTPS sem alterar a atribuição da fonte.

Aceitar qualquer domínio não garante reprodução de todos os vídeos. A origem pode exigir login, executar JavaScript para obter a mídia, usar DRM, bloquear incorporação, restringir região ou impedir acesso externo ao arquivo. Nesses casos o app explica a limitação e mantém Abrir na fonte. Nenhuma proteção da origem é removida.
