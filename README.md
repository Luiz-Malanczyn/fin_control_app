# Controle Financeiro

App pessoal de controle financeiro. Backend em Python (FastAPI), frontend em React (Vite, PWA), PostgreSQL.

## Estrutura

```
backend/    API FastAPI (auth, transações, recorrências, dashboard)
frontend/   React + Vite, PWA
docker-compose.yml   Postgres local para desenvolvimento
```

## Rodando localmente

### Pré-requisitos

- Python 3.12+ (não encontrado neste ambiente — instale antes de continuar: https://www.python.org/downloads/)
- Node.js 20+ (já disponível)
- Docker, para o Postgres local (ou aponte `DATABASE_URL` para um Neon de dev)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env        # e ajuste os valores
```

Suba o Postgres local (na raiz do repo):

```bash
docker compose up -d
```

Rode as migrations e suba a API:

```bash
cd backend
alembic upgrade head
uvicorn app.main:app --reload
```

API em `http://localhost:8000`, docs interativas em `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env.local   # aponta VITE_API_URL para o backend local
npm run dev
```

App em `http://localhost:5173`.

## Deploy gratuito

Detalhes e trade-offs de cada escolha estão no documento de arquitetura. Resumo dos passos:

1. **Banco — Neon**: crie um projeto em [neon.tech](https://neon.tech), copie a connection string para `DATABASE_URL`.
2. **Backend — Google Cloud Run**:
   ```bash
   cd backend
   gcloud run deploy fin-control-api --source . --region southamerica-east1 --allow-unauthenticated
   ```
   Configure as variáveis de ambiente do `.env.example` no serviço (Console ou `gcloud run services update --set-env-vars`).
   Depois do primeiro deploy, rode `alembic upgrade head` apontando `DATABASE_URL` para o Neon (uma vez, localmente ou via Cloud Shell).
3. **Agendamento — Cloud Scheduler**: crie um job diário que faça `POST` para `https://<sua-api>/internal/cron` com o header `X-Cron-Secret: <mesmo valor de CRON_SECRET>`.
4. **Frontend — Vercel**: importe o repositório, root directory `frontend`, defina `VITE_API_URL` apontando para a URL do Cloud Run.
5. Atualize `CORS_ORIGINS` no backend com a URL final da Vercel.

## Próximos passos de produto

Ver seção "Vale a pena adicionar" no documento de arquitetura: orçamento por categoria, modo casal, alertas de vencimento, exportação de relatórios, patrimônio.
