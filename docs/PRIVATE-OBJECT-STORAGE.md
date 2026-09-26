# Armazenamento privado de fotos e e-books

Fotos das avaliações e PDFs novos são gravados no Cloudflare R2 quando todas as
variáveis `R2_*` estão configuradas. O bucket deve permanecer privado. O backend
verifica a sessão e a propriedade do conteúdo antes de entregar qualquer arquivo.

## Variáveis do Railway

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=bruna-affonso-private-files`
- `R2_ENDPOINT` (opcional)

Se alguma variável obrigatória estiver ausente, o ambiente de desenvolvimento
continua usando `private_uploads/`. Em produção, configure as quatro variáveis
antes de publicar esta versão.

## Compatibilidade durante a migração

O download tenta primeiro o R2 e depois o diretório legado. Assim, a publicação
pode ocorrer antes da cópia dos arquivos antigos. Não remova o volume antigo até
comparar a quantidade e o tamanho de todos os objetos migrados.

O token do R2 deve ter acesso apenas de leitura e gravação ao bucket da Bruna.
Nunca coloque a chave no frontend ou em arquivos versionados.
