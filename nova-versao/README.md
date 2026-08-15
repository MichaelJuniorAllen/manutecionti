# Nova Versão - Sistema de Chamados

A pasta `nova-versao/` contém uma implementação completa e isolada de um sistema profissional de helpdesk/tickets, sem alterar os arquivos existentes do projeto original em `Appchamados/`.

## Visão geral

A solução foi dividida em duas aplicações:

- **Backend** em Node.js + Express com autenticação JWT e banco SQLite via `better-sqlite3`
- **Frontend** em React + Vite com layout profissional, dashboard, histórico e relatórios

O sistema permite autenticação de usuários, criação e acompanhamento de chamados, filtros operacionais, edição de tickets e relatório do dia anterior.

## Stack utilizada

### Backend

- Node.js
- Express
- better-sqlite3
- bcryptjs
- jsonwebtoken
- uuid
- dotenv
- cors

### Frontend

- React
- React Router DOM
- Vite

## Estrutura do projeto

```
nova-versao/
  backend/
  frontend/
  README.md
```

## Instalação

### 1) Backend

```bash
cd nova-versao/backend
npm install
cp .env.example .env
```

### 2) Frontend

```bash
cd nova-versao/frontend
npm install
```

## Variáveis de ambiente do backend

Arquivo: `nova-versao/backend/.env`

```env
PORT=4000
JWT_SECRET=nova-versao-secret-dev
JWT_EXPIRES_IN=8h
CORS_ORIGINS=http://localhost:5173
DB_PATH=./data/database.sqlite
```

### Explicação

- `PORT`: porta HTTP do backend
- `JWT_SECRET`: segredo usado para assinar e validar tokens JWT
- `JWT_EXPIRES_IN`: tempo de expiração do token
- `CORS_ORIGINS`: lista de origens permitidas separadas por vírgula
- `DB_PATH`: caminho do arquivo SQLite

## Banco de dados

O backend inicializa automaticamente o schema na primeira execução usando o arquivo:

- `backend/src/db/schema.sql`

Tabelas criadas:

- `users`
- `tickets`

## Seed inicial

Para popular o banco com usuários e chamados de exemplo:

```bash
cd nova-versao/backend
npm run seed
```

Usuários padrão criados pelo seed:

- **Administrador**
  - E-mail: `admin@example.com`
  - Senha: `admin123`
- **Usuário padrão**
  - E-mail: `user@example.com`
  - Senha: `user123`

O seed também cria 5 chamados de amostra em diferentes estados e prioridades.

## Como executar

### Backend em desenvolvimento

```bash
cd nova-versao/backend
npm run dev
```

### Backend em produção/local simples

```bash
cd nova-versao/backend
npm start
```

### Frontend em desenvolvimento

```bash
cd nova-versao/frontend
npm run dev
```

O Vite já está configurado para fazer proxy de `/api` para `http://localhost:4000`.

### Build do frontend

```bash
cd nova-versao/frontend
npm run build
npm run preview
```

## Funcionalidades principais

- Autenticação com login, cadastro e sessão baseada em JWT
- Dashboard com cards de resumo, tickets do dia e lista de chamados recentes
- Cadastro de novos chamados com prioridade e categoria
- Listagem completa de tickets com filtros por status, prioridade e busca textual
- Detalhamento e edição de chamados
- Exclusão de chamados com validação de permissão
- Histórico pessoal do usuário autenticado
- Relatório do dia anterior com total criado, total resolvido, distribuição por status e prioridade
- Endpoint de health check para monitoramento
- Estrutura pronta para servir build estático do frontend via backend em produção

## Resumo dos endpoints da API

Base da API: `/api`

### Health

- `GET /api/health` — status da aplicação

### Autenticação

- `POST /api/auth/login` — autentica com e-mail e senha
- `POST /api/auth/register` — cria novo usuário
- `GET /api/auth/me` — retorna o usuário autenticado

### Tickets

- `GET /api/tickets` — lista tickets com filtros opcionais: `status`, `priority`, `search`, `userId`
- `POST /api/tickets` — cria ticket autenticado
- `GET /api/tickets/:id` — retorna um ticket específico
- `PUT /api/tickets/:id` — atualiza status, título, descrição, prioridade e categoria
- `DELETE /api/tickets/:id` — remove um ticket
- `GET /api/tickets/my` — retorna tickets do usuário autenticado

### Relatórios

- `GET /api/reports/yesterday` — retorna estatísticas do dia anterior

### Usuários

- `GET /api/users` — lista usuários (somente admin)
- `GET /api/users/:id` — retorna um usuário específico

## Observações importantes

- O projeto utiliza **ESM** (`"type": "module"`) no backend e no frontend.
- O backend utiliza `better-sqlite3`, portanto as operações de banco são síncronas.
- O frontend lê a base da API por `import.meta.env.VITE_API_URL` ou usa `/api` por padrão.
- Todos os arquivos desta versão ficam confinados em `nova-versao/`, preservando o restante do repositório.
