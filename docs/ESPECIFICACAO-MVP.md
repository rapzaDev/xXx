# Dojo Atlas — especificação do produto e evolução

## Proposta

Um atlas editorial de vídeos não explícitos para praticantes e curiosos de artes marciais. A diferença está na seleção e na organização do aprendizado: modalidade, nível e notas próprias. Créditos visíveis, fonte acessível e respeito à navegação são princípios do produto.

Dojo Atlas é um nome provisório. Alternativas para pesquisa futura: Tatame Aberto, Movimento Atlas e Fora do Corner. Nenhuma disponibilidade de marca, domínio ou identificador social foi verificada. Defina o público prioritário antes de investir na marca: iniciantes procurando fundamentos é uma hipótese mais específica que todas as pessoas interessadas em esportes.

## Diagnóstico que orienta a solução

Agregadores podem competir por volume e sessões longas. Aqui a hipótese é que um catálogo pequeno e confiável ajuda mais o visitante a decidir o que assistir. A interface usa fundo escuro, acento verde, cabeçalho compacto com busca, categorias laterais e grade densa de vídeos. A biblioteca aparece na primeira tela, sem uma seção promocional antes do catálogo. Não há tomada do botão voltar, pop-under ou autoplay. A ilustração é própria e não depende de fotografias ou miniaturas externas.

Não foi realizado estudo com usuários nem teste comparativo de conversão. Melhor UX é uma hipótese a validar com tarefas e métricas, não uma superioridade já medida.

## Entregue nesta versão

- Interface responsiva em português com navegação por modalidades, filtro de fonte, busca no cabeçalho e grade de densidade ajustável.
- Catálogo inicialmente vazio e suporte a catálogo inicial compartilhado via arquivo JSON.
- Cadastro manual de links de qualquer domínio HTTP/HTTPS e registro de permissão.
- Busca sem distinção de acentos, filtros de modalidade e nível, ordenação por título ou ordem de cadastro.
- Favoritos locais, importação validada, exportação e restauração confirmada.
- Reprodução ao abrir a ficha: player oficial, vídeo direto ou HLS, com identificação automática de mídia publicada em páginas de qualquer domínio público. Configuração opcional de outro endereço de reprodução. Não exibe páginas inteiras no player.
- Aviso de revisão por idade do registro, sem consulta automática ao provedor.
- Manual de operação e indexação.

## Jornadas

Visitante: explorar → filtrar → ler título/criador → abrir ficha e carregar player → assistir ou visitar a fonte → salvar.

Curador local: selecionar fonte → conferir permissão → registrar metadados → testar player → exportar backup.

Curador em produção futura: importar candidatos → revisar → aprovar → publicar → monitorar disponibilidade → corrigir/remover. Esta última jornada requer backend.

## Próxima fase: catálogo compartilhado

Use páginas geradas no servidor ou estaticamente para catálogo público; API e banco relacional para edição autenticada. Um monólito pequeno com PostgreSQL, busca textual nativa e tarefas agendadas é suficiente para validar o produto; não exige microsserviços ou mecanismo de busca dedicado no início.

Entidades sugeridas: sources (provedor, domínio aprovado, política, método), videos (ID interno e externo, URL canônica, título original, criador, disponibilidade), editorial (nota, modalidade, nível, estado), permission_reviews (base, revisor, data, próxima revisão), import_runs (cursor e erros), removal_requests (solicitação e decisão) e exclusions (IDs que não devem retornar). Separe metadados externos de textos editoriais para atualizar APIs sem sobrescrever a curadoria.

Crie unicidade em (provider, external_id). Registros passam por pending, published, unavailable e removed; removed não pode voltar por importação automática. Use datas UTC e trilha de revisão. Não armazene cópias de vídeos nesta arquitetura.

Rotas sugeridas: GET /api/videos e GET /api/videos/:id; POST/PATCH /api/admin/videos para curadores autenticados; POST /api/admin/imports para fontes aprovadas; POST /api/removal-requests para solicitações com proteção antispam. A autorização deve ser checada no servidor em toda mutação, não apenas escondendo botões.

## Atualizações e fontes

Comece por canais conhecidos e parceiros que autorizem a integração. Implemente adaptadores específicos para APIs oficiais, com cota, timeout, retry com backoff, deduplicação e auditoria. Candidatos entram na fila editorial. Verifique disponibilidade periodicamente e as regras de retenção específicas do provedor. Conteúdo removido é despublicado e incluído na lista de exclusão. Não implemente crawler genérico como substituto de autorização.

## Busca e descoberta

Busca deve priorizar correspondência textual, modalidade e nível. As coleções editoriais podem agrupar fundamentos, defesa, preparação física e entrevistas. Não apresente números de visualização, tendências ou ranking sem fonte, janela temporal e atualização. A seção Tendências desta versão é apenas uma categoria editorial.

## SEO

Produza páginas com URL estável, texto original, breadcrumbs, canonical e sitemap. Verifique diretrizes atuais de indexação de vídeo e VideoObject antes de ativar marcação. Não marque como página de vídeo algo que apenas lista cartões. Configure o domínio definitivo antes de gerar URLs absolutas de produção. Verifique sitemap e páginas no Search Console sem prometer indexação.

## Privacidade e acessibilidade

Não carregar players, fontes e trackers externos antes de necessidade. Documentar provedores, dados locais, retenção e forma de apagar. O clique no player atual informa a conexão externa, mas não é uma implementação completa de gestão de consentimento para todas as jurisdições. Uma versão pública comercial precisa de política específica ao operador e ao tratamento real de dados.

Manter foco visível, rótulos, navegação por teclado, diálogos fecháveis, contraste, respeito a movimento reduzido e textos acessíveis. Avaliar com leitor de tela, zoom de 200% e dispositivo móvel real. Evitar a aparência de afiliação oficial com ligas ou criadores sem autorização.

## Monetização futura

Validar retenção e utilidade antes de inserir publicidade. Possibilidades: patrocínio identificado de coleções e recursos pagos de organização pessoal. Qualquer anúncio deve ficar fora da área de interação do player, ter identificação clara e preservar as condições do provedor. Preços, receita e custos ainda não foram estimados com dados reais.

## Critérios de aceite para a próxima fase

- Edição autorizada no servidor e persistência entre dispositivos.
- Importação idempotente e revisão antes de publicar.
- Falha de API não apaga dados editoriais nem publica candidatos automaticamente.
- Remoção impede reimportação do mesmo registro.
- Página indexável por vídeo, dados corretos e fonte visível.
- Rotinas de atualização e exclusão compatíveis com os provedores.
- Backup com restauração testada e limites de uso por endpoint.
- Testes de jornada com cinco pessoas do público-alvo e correções dos problemas encontrados.

## Métricas propostas, ainda não conectadas

Medir tempo para encontrar um vídeo relevante, taxa de resultados vazios, falhas de player, retorno à coleção e pedidos de remoção resolvidos. Definir uma base com uso real antes de estabelecer metas. Analytics só depois de definir necessidade, tratamento de dados e política de privacidade.

## Ordem de execução

1. Curar 15 a 30 registros, testar disponibilidade e ouvir iniciantes.
2. Ajustar categorias e linguagem com base nas tarefas observadas.
3. Implementar catálogo compartilhado, login de curador e fila editorial.
4. Integrar uma API oficial com atualização e exclusão.
5. Gerar páginas individuais, sitemap e dados estruturados corretos.
6. Testar segurança, acessibilidade, operação e recuperação; então avaliar abertura pública.

## Verificação desta entrega

Testes automatizados cobrem canonicalização de fontes, rejeição de URLs inadequadas, permissão obrigatória, duplicados, geração segura da URL de embed e aviso de revisão. Esses testes não comprovam direitos, disponibilidade de players, SEO, segurança de um futuro backend ou desempenho sob carga.
