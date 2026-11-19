# Digital Store — Back-end

API REST em Node.js e Express para a Digital Store. Implementa usuários, categorias e produtos com MySQL e Sequelize, login com JWT, senha protegida por bcrypt, documentação OpenAPI e testes Jest.

**Integrantes: yanna julia dantas de souza

[Enunciado oficial da Digital College](https://github.com/digitalcollegebr/projeto-backend)

## Primeira execução no Windows

1. No Explorador de Arquivos, clique com o botão direito no ZIP, escolha **Extrair Tudo** e confirme.
2. No VS Code, use **Arquivo → Abrir Pasta**. Selecione a pasta `digital-store-backend` que contém o arquivo `package.json`. Abra **Terminal → Novo Terminal**.
3. No terminal, rode os comandos abaixo, um por vez. O sufixo `.cmd` evita o bloqueio do script npm no PowerShell.

   ```powershell
   npm.cmd ci
   node scripts/setup-env.js
   ```

   O segundo comando cria o arquivo local `.env` com uma senha para o banco e uma chave JWT aleatórias. O projeto precisa de Node.js 20 ou superior e de um servidor **MySQL 8**. O MySQL Workbench sozinho não é o servidor.

4. Escolha **uma** das opções de banco abaixo.
5. Com o banco ligado, rode:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd test
   npm.cmd run dev
   ```

6. Deixe o terminal aberto e acesse **[Swagger da API](http://localhost:3000/docs/)**. Em **[status da API](http://localhost:3000/health)**, a resposta esperada é `{"status":"ok"}`. Para parar o servidor, pressione `Ctrl+C`.

No macOS ou Linux, use `npm` no lugar de `npm.cmd`.

### Opção A — Docker Desktop já instalado

Abra o Docker Desktop, espere iniciar e, no terminal do VS Code, rode:

```powershell
docker compose up -d --wait
```

O Compose inicia o MySQL e cria o banco e o usuário usando o `.env`. Se a porta 3306 já estiver ocupada, altere `DB_PORT` para `3307` no `.env` antes de subir o contêiner. Para parar o banco, use `docker compose stop`. Não é preciso instalar o MySQL separadamente nessa opção.

### Opção B — MySQL Server já instalado

Confirme que o serviço MySQL está em execução. Em uma sessão administrativa do Workbench ou do cliente MySQL, execute os comandos abaixo. Substitua `SENHA_DO_ENV` pela senha que está na linha `DB_PASSWORD` do seu `.env`. Se você já tem um usuário de banco com acesso à base, pode configurar os dados dele no `.env` em vez de criar outro.

```sql
CREATE DATABASE IF NOT EXISTS digital_store
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'digital_store'@'localhost' IDENTIFIED BY 'SENHA_DO_ENV';
GRANT ALL PRIVILEGES ON digital_store.* TO 'digital_store'@'localhost';
```

Se `npm.cmd run db:migrate` retornar `ECONNREFUSED`, confira se o serviço está ligado e se a porta no `.env` está correta. Se aparecer `Access denied`, confirme o usuário e a senha. Se o usuário já existia, `CREATE USER IF NOT EXISTS` não altera a senha dele.

## Demonstração no Swagger

1. Abra `POST /v1/user`, clique em **Try it out** e **Execute**. Pode usar o exemplo, com o mesmo valor em `password` e `confirmPassword`. A resposta é `201`.
2. Em `POST /v1/user/token`, use o mesmo e-mail e a mesma senha. Copie apenas o valor do campo `token`, sem aspas. Clique em **Authorize** no topo e cole esse valor, sem digitar a palavra `Bearer`.
3. Em `POST /v1/category`, cadastre uma categoria e anote o `id`.
4. Em `POST /v1/product`, teste com o exemplo abaixo. Em `category_ids`, use o ID obtido no passo anterior. Imagens e opções podem ser omitidas.

   ```json
   {
     "enabled": true,
     "name": "Tênis esportivo",
     "slug": "tenis-esportivo",
     "stock": 10,
     "description": "Tênis para caminhada",
     "price": 199.90,
     "price_with_discount": 149.90,
     "category_ids": [1],
     "options": [{"title": "Tamanho", "values": ["38", "39", "40"]}]
   }
   ```

5. Em `GET /v1/product/search`, teste o filtro `match` com `Tênis`. Em `PUT /v1/product/{id}`, envie o corpo do cadastro com o estoque alterado. A atualização e a exclusão bem-sucedidas retornam `204`, sem corpo.

### Rotas

| Métodos e rota | Acesso |
| --- | --- |
| `POST /v1/user` e `POST /v1/user/token` | Público |
| `GET /v1/user/:id` | Público, conforme enunciado. Nunca retorna a senha |
| `PUT /v1/user/:id` e `DELETE /v1/user/:id` | JWT do próprio usuário |
| `GET /v1/category/search` e `GET /v1/category/:id` | Público |
| `POST /v1/category`, `PUT /v1/category/:id` e `DELETE /v1/category/:id` | JWT |
| `GET /v1/product/search` e `GET /v1/product/:id` | Público |
| `POST /v1/product`, `PUT /v1/product/:id` e `DELETE /v1/product/:id` | JWT |

- **Paginação:** `limit=12` e `page=1` por padrão. `limit=-1` retorna todos. Use `fields=id,name` para limitar os campos da listagem.
- **Filtros:** em categorias, use `use_in_menu=true` ou `false`. Em produtos, combine `match`, `category_ids=1,2` (qualquer uma das categorias), `price-range=100-200` (preço original) e `option[45]=GG,PP` (qualquer um dos valores para a opção de ID 45).
- **Imagens:** envie Base64 de PNG, JPEG, GIF ou WebP com até 2 MB por arquivo, ou uma URL HTTP(S). O servidor guarda os arquivos locais em `uploads/`. O campo `content` na resposta contém a URL da mídia.
- **Atualizações:** em `images` e `options`, um item sem `id` cria um registro, um item com `id` altera o registro e `{"id":1,"deleted":true}` o remove. Omitir a lista mantém os itens existentes. Enviar `category_ids` substitui os vínculos, e `[]` remove todos.
- **Contrato:** o enunciado diverge entre `400` e `401` para falhas de token. A API segue o `401` das rotas específicas. Cadastro e login são públicos para que o primeiro token possa ser emitido. O login inválido retorna `400` como no enunciado. A atualização e a exclusão de outra conta retornam `403` quando a conta existe.
- **Autorização do catálogo:** o enunciado não define papéis administrativos. Usuários autenticados podem alterar categorias e produtos. Não use dados pessoais reais neste projeto acadêmico.
- **Integração opcional com o front-end:** a API não substitui o front-end já publicado. Ela aceita por padrão as origens locais do Vite `http://localhost:5173` e `http://127.0.0.1:5173`. Ajuste `CORS_ORIGINS` para outros endereços. Se hospedar atrás de proxy, use `PUBLIC_BASE_URL` para a origem pública das imagens.

## Estrutura e banco

- `src/routes` define os endpoints, `src/controllers` recebe as requisições, `src/services` concentra a lógica do catálogo e da mídia e `src/models` define os modelos Sequelize.
- `src/middleware` centraliza autenticação, validação e erros. `docs/openapi.json` contém o contrato usado pelo Swagger.
- `migrations` cria `users`, `categories`, `products`, `product_images`, `product_options` e `product_categories`. Produtos e categorias têm uma relação muitos para muitos. Imagens e opções pertencem a um produto. Chaves estrangeiras, índices e transações mantêm a consistência dos vínculos.
- `npm.cmd run db:migrate` aplica migrations pendentes. `npm.cmd run db:undo` desfaz a última migration e, neste projeto, remove as tabelas do catálogo e de usuários. Use apenas em banco descartável.

## Testes

- `npm.cmd test` roda os testes HTTP com dependências simuladas, sem precisar do banco.
- `npm.cmd run test:mysql` roda a integração com MySQL. Aponte o `.env` para um banco de testes vazio e aplique a migration primeiro. O teste cadastra, consulta, atualiza e exclui seus próprios registros.
- O GitHub Actions está configurado para rodar as duas suítes com um MySQL descartável.

