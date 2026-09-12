# Resultados autoritativos do Teste de Força

Os resultados são derivados na leitura a partir de carga, repetições e peso corporal
do próprio `AssessmentCycle`. Não há alteração no schema, migração ou escrita de
força relativa/classificação. Leituras de ciclos existentes não atualizam seu histórico.

## Endpoints e compatibilidade

Cada ciclo retornado por estes endpoints ganha `strengthResults` e `strengthComparison`:

- `GET /api/assessments`
- `GET /api/admin/students/:studentId/assessments`
- `PATCH /api/assessments/:cycleId/stages/:stage`
- `POST /api/admin/students/:studentId/reassessments`

Os campos existentes, inclusive `strengthTest` e `bodyAssessment`, são preservados.
O upload de foto mantém a resposta existente; o frontend já recarrega os ciclos em seguida.
Os controles de acesso das rotas permanecem: aluna somente nos próprios ciclos e ADM nas consultas administrativas.

O PR #10 de `seja2b/bruna-affonso-frontend` continua compatível com o formato dos
dados-base, mas **ainda recalcula resultados localmente**, inclusive no PDF. Para
usar a fonte autoritativa deverá consumir os novos campos na aluna, ADM e PDF.
Uma prévia de formulário não salvo pode continuar local, identificada como prévia.
O backend ignora estimativas, classificações e resultados derivados enviados pelo cliente.

## Contrato de resultados

`strengthResults` contém `rulesVersion: "epley-strength-v1"`, `formula: "EPLEY"` e
`exercises`, com as chaves `smithSquat`, `closeGripPulldown`, `seatedDumbbellPress` e `deadlift`.
Cada exercício contém:

| Campo | Significado |
| --- | --- |
| `loadKg`, `repetitions` | Entradas válidas normalizadas, ou `null`. |
| `estimatedOneRm` | Epley: `carga * (1 + repetições / 30)`, sem arredondamento prévio. |
| `bodyWeightKg` | Peso válido do próprio ciclo, nunca emprestado de outro. |
| `relativeStrength` | `estimatedOneRm / bodyWeightKg` para Smith e terra; `null` nos demais. |
| `classification` | `Fraco`, `Bom`, `Excelente` ou `null`. |
| `relativeStrengthApplicable`, `classificationApplicable` | Verdadeiros somente para Smith e terra. |
| `classificationReason` | Motivo da ausência da classificação, ou `null` quando classificado. |
| `resultReason` | `NOT_PERFORMED`, `MISSING_OR_INVALID_INPUT`, ou `null` quando há 1RM. |
| `notPerformed`, `notPerformedReason` | Exercício explicitamente não realizado e justificativa. |

Motivos de classificação:

- `NOT_APPLICABLE`: puxador e desenvolvimento, mesmo com 1RM disponível.
- `NOT_PERFORMED`: Smith/terra explicitamente não realizado.
- `MISSING_OR_INVALID_INPUT`: falta carga/repetições válidas.
- `MISSING_OR_INVALID_BODY_WEIGHT`: há 1RM, mas falta peso válido no próprio ciclo.
- `BELOW_DEFINED_RANGE`: Smith abaixo de 0,75x ou terra abaixo de 1,00x.
- `UNDEFINED_RANGE`: Smith estritamente acima de 1,20x e abaixo de 1,25x.

Smith: Fraco `[0,75; 1,00)`, Bom `[1,00; 1,20]`, Excelente `[1,25; +∞)`.
Terra: Fraco `[1,00; 1,25)`, Bom `[1,25; 1,50)`, Excelente `[1,50; +∞)`.
Não há classificação geral da aluna. A classificação descreve exclusivamente o teste daquele exercício.
Arredondar somente para apresentação; o cálculo/classificação utiliza a precisão numérica original.

`strengthTest.<exercício>.estimatedOneRm` continua sendo atualizado com duas casas
quando aquele exercício é salvo, para compatibilidade. Pode estar ausente ou
desatualizado em registros antigos: consumidores devem usar `strengthResults`.
Repetições iguais a 1 também seguem estritamente a fórmula Epley solicitada.

## Comparação

`strengthComparison` é `null` sem ciclo anterior. Nos demais casos inclui
`rulesVersion`, `referenceCycleId`, `referenceSequence`, `currentCycleId`,
`currentSequence` e `exercises`.

O ciclo de referência é a maior sequência menor que a atual da mesma aluna,
como no PR #10. Não há substituição silenciosa por um ciclo mais antigo com dados
completos nem por um ciclo de outra aluna. A reavaliação 2 é comparada com a 1.
O serviço também aceita uma referência anterior explícita da mesma aluna; os
endpoints atuais usam somente a referência automática, sem novo parâmetro.

Cada exercício contém `previous` e `current`, ambos com o contrato de resultados
acima, `differenceKg = 1RM atual - 1RM anterior`,
`evolutionPercent = differenceKg / 1RM anterior * 100` e `comparisonReason`.
Diferença e percentual ficam `null` com `INSUFFICIENT_DATA` se faltarem entradas.
A falta de peso impede força relativa/classificação, mas não o comparativo de 1RM.

## Salvamento parcial e conclusão

O PATCH recebe `{ data: { ...campos }, complete: boolean, healthConsent?: boolean }`.
`data` deve ser objeto. Campos omitidos são preservados, inclusive campos internos
dos exercícios e campos legados. `null`, string vazia ou espaços limpam um campo
numérico para `null`; não viram zero. Strings numéricas são aceitas para os inputs
do PR #10. Booleanos, arrays, objetos e números fora dos limites retornam HTTP 400.

- Peso: maior que zero, até 500 kg. Obrigatório para concluir `BODY` e o ciclo.
- Carga: maior que zero, até 1000 kg. Zero retorna 400, alinhado ao cálculo positivo do PR #10.
- Repetições: inteiros de 1 a 100.
- Rascunho: admite campos ausentes, mas rejeita valores inválidos fornecidos.
- Conclusão de `STRENGTH`: os quatro exercícios devem ter carga/repetições válidas
  **ou** `notPerformed: true` e `notPerformedReason` não vazio.
- Flexões e abdominais são opcionais, inteiros de 0 a 10000; prancha é opcional,
  de 0 a 86400 segundos. Zero é um resultado válido de resistência.
- `complete` omitido equivale a rascunho (`IN_PROGRESS`). `complete: true` valida
  os dados combinados com o registro existente.

Exemplo de atualização parcial, preservando repetições e demais exercícios:

```json
{ "data": { "smithSquat": { "loadKg": 45 } }, "complete": false }
```

Exercício não realizado:

```json
{ "data": { "deadlift": { "notPerformed": true, "notPerformedReason": "Orientação profissional" } }, "complete": false }
```

Essa marcação limpa carga/repetições/estimativa daquele exercício. Não envie carga
ou repetições junto com `notPerformed: true`. Para registrar sua realização depois,
envie `notPerformed: false` com as entradas; a justificativa anterior é limpa.
O PR #10 não possui ainda controles para esse novo estado explícito.

## Integridade do ciclo e dados antigos

Salvamentos usam transação e bloqueio da linha do ciclo antes da leitura/mesclagem.
Isso evita perda de atualizações simultâneas de JSON e status de etapas.
A mesma rotina finaliza o ciclo tanto na última etapa quanto na última das 23
posições de fotos. Pontos de reavaliação são concedidos uma vez, na mesma transação.
Fotos rejeitadas são removidas do armazenamento temporário; falha de validação
reverte a escrita do banco.

Para finalizar um ciclo ainda aberto, são novamente verificados os quatro
exercícios, peso e consentimento, inclusive se etapas antigas estavam marcadas
como concluídas sem esses dados. A falha retorna 400, sem inventar valores.
Ciclos históricos já concluídos continuam legíveis, mesmo incompletos, sem
revalidação destrutiva. Ciclos vencidos ou concluídos continuam bloqueados para
escrita (409). Reabrir/prorrogar ciclos é um fluxo administrativo separado e não
foi adicionado nesta alteração.

## Testes

- `npm test`: cálculo, faixas, ausências, validação, patch parcial e histórico.
- `npm run test:integration`: handlers HTTP reais, Prisma e PostgreSQL, incluindo
  concorrência, rollback e conclusão pela última foto.

A integração exige `TEST_DATABASE_URL` apontando para um PostgreSQL isolado com o
schema aplicado. Nunca usa `DATABASE_URL` como fallback nem acessa produção.
O CI cria um PostgreSQL 16 descartável, aplica `prisma db push` somente nele e
executa a suíte. Para execução local, prepare esse banco de testes e gere o
cliente Prisma antes de rodar o comando. Não execute o script de inicialização
de produção para preparar testes.
