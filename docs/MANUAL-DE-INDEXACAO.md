# Manual de coleta e catálogo local — Dojo Atlas

## Iniciar e visualizar

Na pasta do projeto, execute npm ci na primeira instalação e npm start para abrir o servidor. Acesse http://localhost:4173. A execução usa seu computador e SQLite local, sem contratar serviços ou consumir API de IA.

O servidor inicia a coleta das fontes configuradas. Os resultados aparecem progressivamente. Você pode buscar por título ou criador e combinar a busca com categoria e fonte. A grade tem paginação; ela não carrega a coleção inteira no navegador. Os cartões mostram a miniatura, o botão de reprodução e a duração; nomes de categorias e contagens não são sobrepostos à imagem. As miniaturas passam pelo servidor local, que recupera um endereço atualizado na fonte se o link anterior falhar.

Na ordem padrão, os vídeos entram no fim da sequência. Durante a coleta, os cartões que você está vendo permanecem no lugar; espaços livres são preenchidos e os demais resultados vão para as páginas seguintes. A ordem é obtida dos registros existentes do SQLite, sem criar outra lista salva. O mesmo comportamento vale nos filtros por categoria e fonte e na busca.

## Arquivo de fontes

config/sources.json define as fontes e o ritmo da coleta. Os adaptadores iniciais são xvideos, xhamster e pornhub. Cada entrada possui identificador, nome, URL, adaptador e enabled. Algumas possuem directory, o caminho para a listagem de categorias.

Para pausar uma fonte nas próximas execuções, altere enabled para false. Seus dados ficam preservados no SQLite e deixam de aparecer na busca após a configuração ser sincronizada. Adicionar um domínio com outra estrutura exige implementar e testar o adaptador correspondente.

As configurações e o código são versionados; os resultados, o banco e a fila ficam na pasta .data, excluída do Git.

## Categorias e deduplicação

Categorias com o mesmo nome são unidas após normalizar maiúsculas e espaços. Nomes em idiomas diferentes não são traduzidos ou agrupados automaticamente.

O mesmo vídeo encontrado em duas categorias da mesma fonte conserva uma ficha e os dois vínculos. Vídeos de fontes diferentes conservam suas referências próprias; a aplicação não presume que títulos iguais sejam o mesmo vídeo.

Vídeos encontrados na página inicial podem aparecer antes de serem associados a uma categoria. A indicação Página inicial descreve essa situação e não cria uma categoria artificial.

## Coleta e paginação

A coleta percorre as categorias e segue links de próxima página reconhecidos. A fila mantém o progresso no banco, com retomada após encerramento. O teto inicial é de 25 páginas por fonte/execução e 100 por fonte/dia. O teto diário usa a data UTC. Há intervalo entre consultas, limite de tamanho, tempo de resposta e redirecionamentos.

Os limites definem a velocidade de exploração, sem impor um número máximo de vídeos. Uma coleção grande pode levar bastante tempo para ser percorrida. Novidades e páginas antigas têm turnos separados na fila, para uma atualização não impedir o avanço do histórico. Páginas que repetem os mesmos vídeos são detectadas para interromper ciclos de paginação.

Cada fonte pode mudar seu HTML, remover categorias ou apresentar uma verificação de acesso. A interface mostra esses problemas e preserva os dados anteriores. Erros não são apresentados como coleta completa. A coleta respeita as regras de robots.txt e não executa os scripts recebidos.

## Executar e pausar

npm start mantém o site e a coleta automática abertos. O agendamento é de seis em seis horas e funciona enquanto o processo e o computador estiverem ativos. Suspender ou desligar o Mac adia as atualizações.

Coletar agora inicia uma execução adicional respeitando os mesmos limites. Pausar coleta interrompe o trabalho atual e o agendamento deste servidor. Ativar coleta periódica retoma o processo. Encerrar o terminal também interrompe a execução, preservando o progresso.

npm run collect faz uma execução sem abrir o site. npm run collect:watch mantém somente o coletor ativo. Uma trava no SQLite impede duas coletas simultâneas. Se houver um coletor independente em outro terminal, ele deve ser encerrado naquele terminal; o botão do site controla o processo do servidor local.

## Reprodução

Ao abrir uma ficha, a aplicação usa o player identificado para a fonte ou procura um endereço de reprodução publicado pela página. YouTube, Vimeo, XVideos, xHamster e Pornhub possuem reconhecimento de URLs; arquivos HTTPS e streams HLS também são suportados.

No xHamster, a ficha usa o elemento de vídeo do próprio catálogo. O servidor local identifica os arquivos MP4 públicos da página e repassa o streaming, com suporte a solicitações parciais para avanço e retrocesso. Não carrega o iframe de clique externo do provedor nem grava o arquivo do vídeo. As referências temporárias ficam somente em memória e podem ser renovadas ao reabrir a ficha. Abrir na fonte continua sendo uma ação explícita no botão correspondente.

O vídeo permanece na plataforma de origem. O carregamento do player e da miniatura conecta o navegador à fonte, que pode processar dados de acesso. Login, região, disponibilidade ou restrições de incorporação ainda podem afetar a reprodução. A identificação de um player não confirma que o vídeo foi assistido ou que existe licença para redistribuí-lo.

## Dados, favoritos e backup

O catálogo e os cadastros manuais ficam em .data/catalog.sqlite. A limpeza do navegador não apaga esse banco. Favoritos ficam no navegador porque não há contas nesta etapa.

Cadastros antigos no localStorage do mesmo endereço local são importados para o banco após validação. O conteúdo antigo só é removido do armazenamento do navegador quando a importação termina com sucesso. Dados de outro domínio ou de outro navegador precisam ser exportados e importados manualmente.

Exportar JSON cria uma cópia dos metadados. Importar JSON aceita o formato exportado e os registros manuais antigos, até 10.000 registros e 2 MB por vez. Para coleções maiores, encerre o servidor e o coletor, e faça uma cópia completa da pasta .data.

Os dados coletados são metadados observados, não uma declaração de autorização. Cadastros manuais mantêm o registro de revisão informado por quem os adicionou.

## Validação e evolução

npm test executa testes isolados de extração, categorias, pesquisa, persistência, retomada da fila, limites e API. As fontes reais também precisam ser verificadas periodicamente porque suas estruturas podem mudar.

Esta versão escuta somente no computador local. Para produção pública será necessário conectar o catálogo ao banco hospedado e executar o coletor em infraestrutura disponível independentemente do Mac. Abrir o acesso público não faz parte desta etapa.
