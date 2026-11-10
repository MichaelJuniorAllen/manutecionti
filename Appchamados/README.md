# AppChamados

Plataforma de gerenciamento de chamados com frontend React (Vite) e backend Node.js/Express.

## Como rodar

1. Entre na pasta `Appchamados`.
2. Instale as dependências:

```bash
npm install
```

3. Inicie frontend + backend:

```bash
npm start
```

Serviços padrão:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`

## Persistência de dados

O backend suporta dois modos:

- `PostgreSQL` quando `DATABASE_URL` estiver configurada (recomendado para produção)
- `JSON local` como fallback quando `DATABASE_URL` não estiver definida (útil para desenvolvimento)

No modo local, a aplicação cria automaticamente `server/data/database.json` se o arquivo não existir.

### Migrar dados locais para PostgreSQL

Depois de configurar `DATABASE_URL`, execute:

```bash
npm run migrate:json-to-postgres
```

Esse comando copia os dados atuais de `server/data/database.json` para PostgreSQL (tabela `app_state`).

## SMTP e Resend para confirmação de e-mail

O sistema usa `Suporte@upacentral.co.uk` como endereço do sistema e `Reply-To` das respostas do chat. Para enviar de verdade, também é necessário configurar as credenciais do provedor (SMTP, `RESEND_API_KEY` ou `EMAIL_SERVICE_API_KEY` do SendGrid); informar somente o endereço de e-mail não autentica o servidor de envio. O endereço precisa estar autorizado/verificado no provedor escolhido.

1. Copie `.env.example` para `.env`.
2. Preencha as variáveis SMTP ou `RESEND_API_KEY`/`RESEND_FROM_ADDRESS`.
3. Reinicie o `npm start` e confirme no log `Provedor de e-mail: resend`, `smtp` ou `sendgrid`.

Se Resend estiver configurado, ele passa a ser o provedor principal de e-mail. Em produção, sem SMTP/Resend/SendGrid configurado, a API informa erro em vez de confirmar um envio inexistente. Para testes locais, defina `EMAIL_FALLBACK_ENABLED=true` para registrar o código no log do servidor.

Chamados podem incluir o e-mail pessoal opcional do solicitante. Quando informado, o sistema envia a esse endereço a confirmação **“Seu chamado foi aberto com sucesso!”**, com o número do chamado e um link privado para o chat. As respostas da equipe também são enviadas ao mesmo endereço. Configure um provedor real (SMTP, Resend ou SendGrid) e `PUBLIC_APP_URL` com a URL do frontend (por exemplo, `https://seu-dominio.com`) para habilitar o envio e gerar links corretos. Sem provedor configurado, o chamado é salvo, mas nenhum e-mail pode ser enviado; a aplicação informa esse erro.

### Gerenciar domínio do Resend

O backend expõe rotas autenticadas em `/api/settings/resend-domains` para criar, listar, recuperar, verificar, atualizar e remover domínios do Resend.

Exemplo de criação:

```bash
POST /api/settings/resend-domains
{ "name": "upacentral.site" }
```

Depois de criar o domínio, use o `id` retornado para consultar ou verificar:

```bash
POST /api/settings/resend-domains/:id/verify
```

## Deploy em produção (Cloudflare Pages + backend externo)

Publique o frontend no Cloudflare Pages/Netlify e o backend em um serviço Node (Render, Railway, Fly.io, VPS etc.). Execute o backend dentro de `Appchamados`, instale com `npm ci` e inicie com `npm start`.

### 1. Configurar backend e PostgreSQL remoto

Cadastre estas variáveis no painel do serviço do backend, nunca em arquivos commitados ou no frontend:

- `NODE_ENV=production`
- `PORT=4000` (ou a porta fornecida pelo host)
- `JWT_SECRET` com pelo menos 32 caracteres aleatórios; não use `chamados-secret-dev`
- `JWT_EXPIRES_IN=8h`
- `PUBLIC_APP_URL=https://SEU-SITE.pages.dev`
- `CORS_ORIGINS=https://SEU-SITE.pages.dev,https://SEU-DOMINIO.com` (somente origens reais)
- `DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/DBNAME`
- `PGSSL=true`
- `SUPPORT_EMAIL=Suporte@upacentral.co.uk`
- Um provedor de envio verificado: SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`), Resend (`RESEND_API_KEY`, `RESEND_FROM_ADDRESS`) ou SendGrid (`EMAIL_SERVICE_API_KEY`, `EMAIL_FROM_ADDRESS`).

O servidor de produção exige PostgreSQL, segredo JWT forte, URL pública do frontend, origens CORS e credenciais de e-mail. Sem esses requisitos, encerra com erro explícito em vez de iniciar com banco JSON local ou declarar notificações funcionando sem provedor.

Como o banco está em outro computador, o backend publicado precisa ter uma rota de rede permanente até ele. Prefira VPN/rede privada ou permita no firewall somente o IP de saída do backend; não exponha a porta `5432` para toda a internet. Configure PostgreSQL para aceitar conexões remotas somente de clientes autorizados, com TLS e um usuário de aplicação de permissões restritas. A aplicação cria a tabela `app_state` automaticamente; esse usuário precisa poder criar e atualizar a tabela.

Um IP `localhost` ou privado não será alcançável por um backend na nuvem. Use no `DATABASE_URL` o endereço realmente alcançável pelo servidor (por exemplo, o IP da VPN). Não envie senhas ou URLs com credenciais pelo GitHub/chat; cadastre-as somente como variáveis secretas no host do backend.

Depois do deploy, verifique `https://SEU-BACKEND/api/health`: `driver` deve ser `postgres` e `email.configured` deve ser `true`.

### 2. Configurar frontend

No Cloudflare Pages/Netlify:

- Build command: `npm run build`
- Publish directory: `dist`
- Variável de produção `VITE_API_URL=https://SEU-BACKEND/api`
- Regra SPA para devolver `index.html` em rotas sem ficheiro.

`VITE_API_URL` e publica e fica incorporada no bundle. Nunca coloque nela senhas, tokens ou chaves de provedores.

### 3. Dados locais e validacao

`server/data/database.json` e `public/uploads/profiles` são dados locais e ficam excluídos dos próximos commits. Em hospedagens com disco efêmero, configure armazenamento persistente para uploads ou use armazenamento de objetos.

1. Confirme no `/api/health` que `driver` é `postgres` e `email.configured` é `true`.
2. Teste cadastro de chamado, confirmação por e-mail, chat, login e histórico.
3. Verifique CORS para cada domínio real do frontend.

> **Histórico do Git:** o JSON local e uma foto de perfil já aparecem em commits anteriores. Deixá-los de fora dos próximos commits não apaga as cópias do histórico remoto. Antes de tornar público um repositório que já foi compartilhado, mantenha-o privado ou planeje a remoção do histórico e a rotação de credenciais/dados expostos.
