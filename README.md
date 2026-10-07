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

## Render deployment

The `render.yaml` Blueprint defines the FastAPI/Django service and a separate
Next.js frontend service. This is a separate service for the web UI—not for
Django Admin, which remains part of the backend service. When prompted for
`API_BASE_URL`, enter the public HTTPS URL of the `jobconnect-api` service.

Use the API service's public HTTPS URL as `API_BASE_URL` for the frontend service.
Configure the PostgreSQL connection and Django Admin credentials in Render's
environment settings; do not commit secrets.
