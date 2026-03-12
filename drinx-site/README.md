# DRINX Site + Banco de Pedidos

Este projeto agora usa um backend Node.js com SQLite para salvar pedidos.

## Rodar localmente

1. Instale dependências:

```bash
npm install
```

2. Inicie o servidor:

```bash
npm start
```

3. Acesse no navegador:

- http://localhost:8787/index.html
- http://localhost:8787/catalogo.html
- http://localhost:8787/combos.html
- http://localhost:8787/admin.html

## Banco de dados

- Arquivo SQLite: `drinx-site/data/orders.db`
- Tabela: `orders`
- Tabela: `products`

## API de pedidos

- `GET /api/health` - status do backend
- `GET /api/orders` - lista pedidos salvos
- `PUT /api/orders/sync` - sincroniza lista de pedidos
- `DELETE /api/orders` - limpa todos os pedidos

## Painel do dono da loja

No painel `admin.html` o dono consegue:

- Cadastrar produto
- Definir preço
- Definir estoque
- Editar e excluir produtos
- Marcar produto como combo

Produtos com estoque `0` não aparecem no catálogo público.

### Acesso protegido

O painel agora exige usuário e senha (HTTP Basic Auth):

- URL: `http://localhost:8787/admin.html`
- Usuário padrão: `luan`
- Senha padrão: `123456789`

Recomendado trocar em produção via variáveis de ambiente:

- `DRINX_ADMIN_USER`
- `DRINX_ADMIN_PASSWORD`

## API de produtos

- `GET /api/store/products` - produtos visíveis para o site
- `GET /api/admin/products` - lista completa para o painel
- `POST /api/admin/products` - cria produto
- `PUT /api/admin/products/:id` - atualiza produto/preço/estoque
- `DELETE /api/admin/products/:id` - remove produto

## Observação

Se abrir o HTML diretamente via arquivo (file://), o frontend tenta usar `http://localhost:8787/api` como fallback para a API.
