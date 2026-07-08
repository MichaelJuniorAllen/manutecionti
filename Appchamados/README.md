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

## Banco local automático

No início da aplicação, o backend verifica automaticamente `server/data/database.json` e cria o arquivo com a estrutura inicial se não existir.

## SMTP para confirmação de e-mail

O sistema já está preparado para envio real do código de confirmação por SMTP.

1. Copie `.env.example` para `.env`.
2. Preencha as variáveis SMTP.
3. Reinicie o `npm start`.

Se SMTP não estiver configurado, o sistema entra em modo fallback local e registra o código no log do servidor para testes.

## Deploy estável (Netlify + Backend externo)

Para funcionar sem erro em produção, publique o frontend no Netlify e o backend em um serviço Node (Render, Railway, Fly.io, VPS etc).

### 1. Publicar backend

No serviço do backend, configure as variáveis:

- `PORT=4000` (ou a porta do provedor)
- `JWT_SECRET=seu_segredo_forte`
- `JWT_EXPIRES_IN=8h`
- `CORS_ORIGINS=https://SEU-SITE.netlify.app`
- SMTP (opcional): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Após deploy, copie a URL pública da API, por exemplo:

`https://seu-backend.onrender.com/api`

### 2. Configurar Netlify

No projeto Netlify:

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable:
	- `VITE_API_URL=https://seu-backend.onrender.com/api`

Este repositório já inclui fallback de SPA:

- `netlify.toml`
- `public/_redirects`

### 3. Validar após publicar

1. Abra o site publicado no Netlify.
2. Crie um chamado como visitante.
3. Faça login e abra “Meu Histórico”.
4. Verifique no backend se CORS aceita seu domínio Netlify.

Se o frontend carregar e as chamadas de API responderem 200/401/403 corretamente (sem erro de CORS), o deploy está estável.
