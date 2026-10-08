# FCA GAP — Especificação Técnica

Oct 7, 2026 · @Ednelson

**Este documento é a fonte de verdade do sistema.** Toda mudança feita durante o desenvolvimento — no schema, nas regras de negócio, nas telas ou na arquitetura — precisa ser refletida aqui, para que esta especificação sempre reflita o estado real do FCA GAP.

## Visão geral

O FCA GAP acompanha fatos, causas, ações e prazos da Regional Norte, seguindo a metodologia Fato → Causa → Ação. Um fato (um problema ou ocorrência identificada numa unidade) pode ter várias causas, e cada causa pode gerar várias ações corretivas — cada uma com datas, responsável(is) e status próprios.

O conjunto de ações de um fato forma o seu plano de ação, com percentual de conclusão calculado automaticamente. O objetivo é dar visibilidade sobre prazos e desempenho em todas as unidades da regional, substituindo o controle manual em planilhas.

## Hierarquia organizacional

&#91;embedded content: hierarquia · Regional > Área > Unidade\]

Cada área pertence a uma regional, e cada unidade pertence a uma área — é essa cadeia que define o que cada papel de usuário enxerga no sistema.

## Modelo de dados

PostgreSQL, com a DDL completa (tabelas, índices, triggers e views) em `schema_fca.sql`, já compartilhado nesta conversa.

| Entidade | Descrição | Campos-chave |
| --- | --- | --- |
| `regionais` | Regional (ex: Regional Norte) | `nome` |
| `areas` | Área dentro de uma regional (ex: Captação) | `regional_id`, `nome` |
| `unidades` | Unidade/campus dentro de uma área | `area_id`, `nome` |
| `usuarios` | Pessoas do sistema, inclusive convidadas sem senha ainda | `unidade_id`, `papel`, `senha_hash`, `convite_token` |
| `fatos` | O problema/ocorrência identificada | `unidade_id`, `titulo`, `status` |
| `causas` | Causa raiz de um fato | `fato_id`, `descricao`, `responsavel_id` |
| `acoes` | Ação corretiva de uma causa | `causa_id`, `inicio_previsto`, `final_previsto`, `data_iniciada`, `data_finalizada`, `status` |
| `acoes_responsaveis` | Ligação muitos-para-muitos entre ação e usuário | `acao_id`, `usuario_id` |

Mecanismos principais:

- `dias_previsto` e `dias_reais` são colunas geradas (`GENERATED ALWAYS AS`), calculadas direto das datas.
- `vw_acoes_detalhadas` agrega os responsáveis de cada ação e calcula se o prazo venceu sem conclusão.
- `vw_plano_fato` consolida o plano por fato: total de ações, concluídas, adiantadas, atrasadas e % de conclusão.

## Regras de negócio

**Status da ação** — calculado automaticamente a partir das datas, nunca definido na mão (uma trigger recalcula mesmo se alguém tentar mudar o campo direto):

não iniciada → (`data_iniciada` definida) → em andamento → (`data_finalizada` definida, comparada a `final_previsto`) → concluída (igual) · adiantada (antes) · atrasada (depois)

**Status do fato** — derivado do conjunto de ações de todas as suas causas: todas concluídas → concluído; pelo menos uma iniciada → em andamento; nenhuma iniciada → aberto. `cancelado` é sempre manual e nunca é sobrescrito por essa lógica.

**Responsáveis** — uma ação pode ter mais de um responsável (relação muitos-para-muitos); a causa tem um único responsável, que é o dono/quem identificou a causa — conceito diferente de quem executa as ações.

**Convite de colaboradores** — ao atribuir um responsável que ainda não tem acesso ao sistema, basta informar nome e e-mail: a conta é criada na hora com `senha_hash` nulo e um convite é enviado por e-mail. A pessoa só define a senha ao aceitar; a partir daí ela já está vinculada às ações atribuídas desde o convite.

Ao digitar o e-mail no formulário, o sistema valida contra a base de usuários e alerta na hora, antes de enviar qualquer coisa: e-mail já cadastrado → a pessoa é atribuída direto à causa/ação, sem novo convite, só um aviso por e-mail; e-mail novo → cria a conta e envia o convite.

**Login** — autenticação por e-mail e senha: só quem tem `senha_hash` preenchido consegue entrar. Quem está só convidado passa primeiro pela tela de definir senha, que já deixa a conta ativa. "Novo usuário" (na tela de Usuários) e "Convidar responsável" (dentro de um fato) são a mesma ação — o mesmo formulário de convite por e-mail, só muda o rótulo conforme o contexto.

## Telas (implementadas)

Protótipo original (referência de conteúdo): [FCA GAP — Protótipo](https://claude.ai/artifact/57JetmQZ65Qg4k1kfG9GNX). As telas reais ficam em `public/`, HTML+JS puro (sem build step), servidas pelo próprio Express junto com a API (`src/app.js` serve `public/` como estático). `Editar causa`/`Editar ação` e `Convidar responsável` fazem dupla função de criar e editar — mesma lógica da regra do SPEC pra "Novo usuário"/"Convidar responsável" serem o mesmo formulário.

| Tela | Arquivo | Conteúdo |
| --- | --- | --- |
| Dashboard | `index.html` | Indicadores gerais e tabela por unidade |
| Fatos | `fatos.html` | Lista de fatos, filtrável por unidade/status/período; cria fato inline |
| Detalhe do fato | `fato.html?id=` | Causas e ações recolhíveis, responsáveis em chips, plano consolidado |
| Painel de prazos | `prazos.html` | Ações agrupadas por urgência (atrasadas, próximos 7 dias, demais) |
| Usuários | `usuarios.html` | Lista de usuários com status de convite/ativo e contagem de causas/ações atribuídas; link para criar novo usuário |
| Convidar responsável | `convidar.html` | Convite por nome + e-mail, lista de convites recentes; com `?retorno_tipo=causa\|acao&retorno_id=`, anexa o usuário direto na causa/ação e volta pra ela |
| Editar/Nova causa | `causa.html?id=` ou `?fato_id=` (nova) | Descrição, responsável, lista das ações da causa |
| Editar/Nova ação | `acao.html?id=` ou `?causa_id=` (nova) | Descrição, datas previstas/reais, status calculado (somente leitura), responsáveis |
| Login | `login.html` | Autenticação por e-mail e senha; tela sem o menu lateral |
| Definir senha | `definir-senha.html?token=` | Primeiro acesso de quem foi convidado: confirma o nome e cria a senha |

O menu lateral é recolhível em todas as telas (desktop) e vira uma gaveta por hambúrguer no mobile (<760px); tem um link de Sair no rodapé que leva pra tela de Login.

**Design**: paleta neutra (grafite/papel) com um sistema de cor semântico reservado só pra status — nunca usado como decoração — e IBM Plex Sans/Mono (mono só em dados tabulares: datas, %, contagens). Ver `public/css/styles.css` pros tokens. Front consome a API só via `fetch` com JWT em `localStorage` (`public/js/api.js`); escopo por papel já vem filtrado do backend, o front só esconde/mostra ações (ex: nav de Usuários/Dashboard, botão de criar) conforme `papel` do usuário logado.

## Arquitetura e stack técnica

| Camada | Fase local | Fase produção |
| --- | --- | --- |
| Frontend | servido junto com a API local | Vercel |
| Backend | Node.js + Express (API REST) | Supabase (ou Express apontando pro Postgres do Supabase) |
| Banco de dados | PostgreSQL local | Postgres gerenciado do Supabase |

Autenticação simples por usuário vinculado a uma unidade, com `papel` controlando o que cada um vê: `gestor_regional` vê toda a regional, `gestor_area` vê as unidades da sua área, `gestor_unidade` vê só a própria unidade, `colaborador` vê o que foi atribuído a ele.

## API REST (implementada)

Express em `src/`, rodando sobre o Postgres local (`fca_gap`). Estrutura: `routes/` (uma por entidade) → `controllers/` (SQL via `pg`) → `services/` (regras compartilhadas) → `middlewares/` (auth e erro).

**Autenticação** — JWT (`jsonwebtoken`), assinado com `JWT_SECRET` (`.env`). `POST /api/auth/login` retorna o token; todas as rotas em `/api/*` exigem `Authorization: Bearer <token>`, exceto `/api/auth/login` e `/api/auth/convites/*` (fluxo de convite, que roda antes de o usuário ter token).

**Escopo por hierarquia** — como `usuarios` só guarda `unidade_id` (sem `area_id`/`regional_id` próprios), `src/services/escopo.js` resolve o escopo de `gestor_area`/`gestor_regional` subindo de `unidade_id` até `area_id`/`regional_id` via join. `colaborador` não usa esse escopo: em fatos/causas/ações/prazos, sua visibilidade é por atribuição direta (`causas.responsavel_id` ou `acoes_responsaveis`), checada à parte em cada controller — inclusive para edição (um colaborador só edita causa/ação da qual é responsável).

**Status automático** — a API nunca aceita `status` de ação no corpo da requisição; quem manda é a trigger do banco (`fn_calcular_status_acao`), a partir de `data_iniciada`/`data_finalizada`. Em fatos, `status` só aceita dois valores manuais: `'cancelado'` (cancelamento manual, como já previsto no schema) e o sentinela `'reabrir'` (recalcula o status a partir das ações, revertendo um cancelamento — fora do PATCH normal porque a trigger do banco só reage a mudanças em `acoes`, não a um `UPDATE` direto em `fatos.status`).

**Convite de colaboradores** — `POST /api/usuarios` é ao mesmo tempo "Novo usuário" e "Convidar responsável": e-mail já cadastrado retorna o usuário existente (sem novo convite); e-mail novo cria a conta com `senha_hash` nulo e dispara o convite. `GET /api/usuarios/verificar-email` dá o aviso em tempo real antes do submit. `GET/POST /api/auth/convites/:token` são as rotas públicas de "Definir senha".

**E-mail** — `src/services/email.js` é um stub: só loga no console o que seria enviado (convite ou aviso de atribuição). Trocar por um provedor real (Resend, SES, SMTP do Supabase) na migração pra produção, mantendo a mesma assinatura das funções.

**Seed local** — `npm run db:setup` (ou só `npm run db:seed`) cria Regional Norte → Captação → Unidade Centro e um usuário admin (`admin@fcagap.local` / `admin123`) — sem isso, ninguém consegue logar num banco vazio, já que todo usuário novo nasce sem senha.

## Próximos passos

1. ~~Inicializar o projeto Node/Express e rodar `schema_fca.sql` num Postgres local~~ — feito
2. ~~Implementar a API REST de fatos/causas/ações/usuários seguindo as regras de status automático~~ — feito
3. ~~Implementar as telas do protótipo como páginas reais, consumindo a API~~ — feito
4. ~~Implementar o fluxo de convite e definição de senha dos colaboradores~~ — feito
5. Validar localmente e então migrar o frontend para o Vercel e o backend/banco para o Supabase
