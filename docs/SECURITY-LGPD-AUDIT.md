# Auditoria de Segurança e Preparação LGPD

Data da revisão: 2026-08-27

> Este documento é uma revisão técnica e de preparação para LGPD. Ele não substitui parecer jurídico e não representa certificação de conformidade.

## 1. Escopo

Repositório: `seja2b/bruna-affonso-backend`

A API trata dados de autenticação, perfil e acompanhamento de alunos. A revisão considera a `main` atual e o hardening proposto na branch `agent/security-lgpd-hardening`.

## 2. Inventário de dados pessoais observado no schema

- nome;
- e-mail;
- telefone/WhatsApp;
- foto de perfil;
- credencial de autenticação (senha armazenada como hash);
- registros de treino, cargas, repetições e observações;
- perguntas e respostas de acompanhamento;
- progresso semanal, pontuação e ranking;
- notificações e datas de atividade.

Observações livres e informações sobre treino podem, dependendo do conteúdo inserido pelo aluno/profissional, conter dados relacionados à saúde. Esses dados exigem tratamento reforçado e avaliação específica de base legal quando se enquadrarem como dados pessoais sensíveis.

## 3. Controles positivos já existentes

- senha armazenada com hash via `bcryptjs`;
- JWT e refresh token com segredos obrigatórios de pelo menos 32 caracteres;
- algoritmo JWT fixado em HS256 no hardening;
- autenticação centralizada por middleware;
- autorização de rotas administrativas por role `ADMIN`;
- cadastro público sempre cria `STUDENT` pendente, sem promoção automática a administrador;
- CORS com allowlist configurável;
- erros internos não são devolvidos ao cliente;
- `x-powered-by` desativado;
- rate limit específico para login, cadastro e refresh;
- ownership checks em rotas sensíveis de acompanhamento do aluno;
- `.env` e arquivos locais de ambiente ignorados pelo Git;
- nenhum segredo real foi identificado nos arquivos atuais revisados.

## 4. Achados de segurança

### ALTO — refresh token não é revogável

O refresh token é JWT stateless. O endpoint de logout encerra somente a sessão local do cliente e não invalida um refresh token já emitido. Um refresh token roubado pode ser reutilizado até expirar.

Recomendação: criar sessões de refresh no banco (hash do token/jti, data de expiração, revogação e rotação). Rotacionar o refresh token a cada uso e revogá-lo no logout.

### ALTO — tokens são armazenados em `localStorage` no frontend

A plataforma guarda access token e refresh token em `localStorage`. Em caso de XSS, um script malicioso executado na origem pode ler esses tokens.

Recomendação: migrar refresh token para cookie `HttpOnly`, `Secure`, `SameSite` e manter access token apenas em memória quando a arquitetura permitir. Essa mudança deve ser coordenada entre frontend e backend.

### MÉDIO — rate limit é local ao processo

O limiter atual usa memória do processo. Ele é útil em uma única réplica, mas reinícios limpam os contadores e múltiplas réplicas não compartilham estado.

Recomendação: quando houver escala horizontal ou necessidade de proteção maior, mover rate limiting para Cloudflare/WAF, Redis ou outro storage distribuído.

### MÉDIO — fotos armazenadas em Base64 no banco

Fotos podem chegar a vários megabytes e ficam armazenadas como texto no PostgreSQL. Isso aumenta tamanho de backups, superfície de retenção e custo de exclusão/portabilidade.

Recomendação: usar object storage privado/assinado e manter apenas URL/chave no banco; definir limite de tamanho, formatos permitidos e política de retenção.

### MÉDIO — campos livres podem conter dado sensível

Notas do aluno/professora e perguntas permitem texto livre. É possível que usuários informem lesões, patologias ou outras informações de saúde.

Recomendação: aplicar minimização, limitar finalidade, evitar diagnóstico clínico desnecessário e definir com assessoria jurídica a hipótese do art. 11 da LGPD aplicável quando houver dado sensível.

### MÉDIO — ausência de política de retenção e descarte no código/processo

Não foi identificado mecanismo de expiração/anonimização para contas inativas, perguntas, notificações, fotos ou registros antigos.

Recomendação: documentar prazos por categoria e automatizar descarte/anonimização quando apropriado, preservando somente o que for necessário por obrigação legal ou defesa de direitos.

### MÉDIO — ausência de fluxo explícito de direitos do titular

Não há endpoint/processo documentado para exportação dos dados, solicitação de exclusão, oposição ou informação de compartilhamento.

Recomendação: disponibilizar canal de privacidade e procedimento interno para confirmar identidade, localizar dados e responder solicitações dentro dos prazos aplicáveis. Self-service pode ser implementado depois, mas não é requisito que tudo seja um endpoint.

### BAIXO/MÉDIO — validação heterogênea

Alguns controllers têm limites bons; outros ainda aceitam textos/URLs sem o mesmo padrão de validação. Padronizar validators reduz abuso, dados inválidos e payloads excessivos.

## 5. Hardening aplicado nesta branch

- headers HTTP defensivos;
- HSTS em produção;
- `Cache-Control: no-store` em autenticação;
- `trust proxy` configurável para identificar IP corretamente atrás do Railway;
- rate limit deixa de confiar diretamente em `x-forwarded-for` arbitrário;
- headers informativos de rate limit;
- timeouts de request/headers/keep-alive;
- access token reduzido de 7 dias para 30 minutos por padrão e configurável via ambiente;
- algoritmo JWT explicitamente restrito a HS256.

## 6. Preparação LGPD — itens organizacionais obrigatórios

Antes de declarar conformidade, a responsável deve validar/documentar, no mínimo:

1. identidade e contato do controlador;
2. finalidades de cada tratamento;
3. base legal aplicável por finalidade;
4. tratamento de dados sensíveis, quando houver;
5. operadores/terceiros (ex.: Railway/PostgreSQL, Cloudflare, MFit e outros efetivamente utilizados);
6. transferências internacionais, se os provedores processarem dados fora do Brasil;
7. prazos de retenção e descarte;
8. procedimento para direitos dos titulares;
9. resposta a incidentes e comunicação quando aplicável;
10. controle de acesso administrativo, revisão periódica de permissões e desligamento de acessos;
11. política de backup e restauração;
12. registro de mudanças relevantes de segurança.

## 7. Próximas etapas recomendadas

Prioridade 1:
- implementar rotação/revogação de refresh token;
- migrar refresh token para cookie HttpOnly;
- publicar política de privacidade e canal de direitos do titular;
- revisar fornecedores e transferências internacionais.

Prioridade 2:
- validação centralizada de payloads;
- object storage para imagens;
- rate limiting distribuído/WAF;
- rotina de retenção/anonimização;
- logs de auditoria de ações administrativas sem registrar dados sensíveis em excesso.

Prioridade 3:
- testes automatizados de autorização/IDOR;
- SAST/dependency scanning e secret scanning no CI;
- revisão periódica OWASP ASVS/API Security Top 10.
