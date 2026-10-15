# JobConnect

JobConnect is a job portal with a FastAPI/PostgreSQL backend, a Next.js
candidate and recruiter interface, and Django Admin for managing portal data.

## Run the full app with Docker Desktop

1. Start Docker Desktop and wait until it reports that Docker is running.
2. Open PowerShell in this folder (`C:\Users\Jeeva\OneDrive\Desktop\Jobconnect`).
3. Start all services:

   ```powershell
   $env:API_PORT = "8003"
   docker compose up --build -d
   docker compose ps
   ```

   Wait for the `db`, `api`, and `frontend` services to report `healthy`.
   If port 8003 is free, you can omit the `API_PORT` line and use port 8001.
4. Open the web app at <http://127.0.0.1:3000>.

   - FastAPI docs: <http://127.0.0.1:8003/docs>
   - Django Admin: <http://127.0.0.1:8003/admin/>
   - API health: <http://127.0.0.1:8003/api/v1/health>

Create a local Django Admin login when needed:

```powershell
docker compose exec api python manage.py createsuperuser
```

The `.env` file supplies local database and signing-key settings. Never commit
or share `.env` values.

Stop the local services without deleting the database volume:

```powershell
docker compose down
```

## Run the Next.js frontend outside Docker

Start PostgreSQL and the API first. Then open a separate PowerShell window:

```powershell
Set-Location "C:\Users\Jeeva\OneDrive\Desktop\Jobconnect\frontend"
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

If the API is on a different port, change `API_BASE_URL` in `frontend\.env.local`
to the local API URL. Open <http://localhost:3000>.

## Use the application

- **Candidates:** create a candidate account, browse and filter open roles, apply
  with a PDF or DOCX resume, and review application statuses in the dashboard.
- **Recruiters:** create a recruiter account, post and close roles, review
  applications, download resumes, and update application status in the dashboard.
- **Administrators:** sign in to Django Admin to manage portal users, jobs, and
  applications. This runs alongside the API.

## Run checks

Python API tests:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend checks:

```powershell
Set-Location "C:\Users\Jeeva\OneDrive\Desktop\Jobconnect\frontend"
npm run lint
npm run build
```

## Automated Daily Job Updates

JobConnect automatically syncs and updates Indian IT fresher and startup postings daily through a 3-tier system:

1. **In-App Background Worker**: The FastAPI server automatically starts an asynchronous background scheduler on boot (`api/main.py`), which ingests new fresher openings and then repeats every 24 hours.
2. **Dedicated Scheduled Sync Endpoint**:
   - `GET /api/v1/jobs/cron-sync` (and `POST /api/v1/jobs/cron-sync`)
   - Protected by `CRON_SECRET` (pass as `?secret=<CRON_SECRET>` or header `X-Cron-Secret: <CRON_SECRET>`).
   - Triggerable by external free schedulers (cron-job.org, EasyCron) or GitHub Actions. Also prevents Render free instances from going idle.
3. **GitHub Actions Scheduled Daily Workflow**:
   - Located at [`.github/workflows/daily_sync.yml`](.github/workflows/daily_sync.yml).
   - Automatically executes every morning at 00:00 UTC (05:30 AM IST) to ping the deployed Render service and ingest newly posted jobs.

---

## Render Deployment Guide

The repository includes a complete [`render.yaml`](render.yaml) Infrastructure-as-Code Blueprint that creates:
- **Managed PostgreSQL Database** (`jobconnect-db`)
- **FastAPI + Django Backend Web Service** (`jobconnect-api`)
- **Next.js Frontend Web Service** (`jobconnect-frontend`)

### Option A: 1-Click Blueprint Deployment (Recommended)

1. Push your repository to your GitHub account:
   ```powershell
   git add .
   git commit -m "Add startup feeds, daily automated sync, and Render blueprint"
   git push origin main
   ```
2. Log in to [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** > **Blueprint**.
4. Select your `jobconnect` GitHub repository.
5. Render will detect [`render.yaml`](render.yaml) and automatically configure:
   - Database `jobconnect-db` with credentials linked automatically.
   - Web service `jobconnect-api` running the backend and Django Admin.
   - Web service `jobconnect-frontend` running the Next.js portal.
6. Click **Apply**.
7. Once deployed, copy your backend URL (e.g. `https://jobconnect-api-xxxx.onrender.com`) and verify the frontend's `API_BASE_URL` environment variable matches this URL.

### Option B: Manual Web Service Deployment on Render

If you prefer deploying services manually without Blueprints:

#### 1. Create PostgreSQL Database
- Click **New +** > **PostgreSQL**.
- Name: `jobconnect-db`, Database: `jobconnect`, User: `jobconnect`, Region: `Singapore`.
- Copy the **Internal Database URL** or connection credentials.

#### 2. Create Backend Web Service (`jobconnect-api`)
- Click **New +** > **Web Service**.
- Select your repository.
- Runtime: **Docker**, Dockerfile Path: `./Dockerfile`, Context: `.`.
- Docker Command: Leave blank (or enter `./start.sh`)
- Environment Variables:
  - `DATABASE_URL`: (Paste Render internal database URL or Neon/Supabase PostgreSQL URL)
  - `JWT_SECRET_KEY`: (Click Generate)
  - `DJANGO_SECRET_KEY`: (Click Generate)
  - `CRON_SECRET`: (Click Generate)
  - `DJANGO_SUPERUSER_USERNAME`: `admin`
  - `DJANGO_SUPERUSER_EMAIL`: `admin@jobconnect.local`
  - `DJANGO_SUPERUSER_PASSWORD`: (Your choice)

#### 3. Create Frontend Web Service (`jobconnect-frontend`)
- Click **New +** > **Web Service**.
- Select your repository.
- Runtime: **Docker**, Dockerfile Path: `./frontend/Dockerfile`, Context: `./frontend`.
- Environment Variables:
  - `API_BASE_URL`: `https://<YOUR-BACKEND-NAME>.onrender.com`
  - `NEXT_TELEMETRY_DISABLED`: `1`

#### 4. Configure Daily Sync Trigger (GitHub Actions)
- In your GitHub Repository, go to **Settings** > **Secrets and variables** > **Actions**.
- Add Repository Secrets:
  - `RENDER_API_URL`: Your backend Render URL (e.g. `https://jobconnect-api-xxxx.onrender.com`)
  - `CRON_SECRET`: The secret key set in Render.
- The workflow [`.github/workflows/daily_sync.yml`](.github/workflows/daily_sync.yml) will trigger every morning at 05:30 AM IST automatically!

