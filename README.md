# De-Lainah Frontend

Next.js App Router console for the currently mounted Django API. Effective permissions from the backend gate navigation and actions; backend authorization remains authoritative.

## Run locally

1. Start Django from `backend/`:

	```bash
	.venv/bin/python manage.py runserver 127.0.0.1:8000
	```

2. In `frontend/`, copy `.env.example` to `.env.local` if the API uses a different address, then run:

	```bash
	npm install
	npm run dev
	```

3. Open `http://localhost:3000`.

The Next.js server proxies `/api/backend/*` to `API_BASE_URL`. Access and refresh tokens are held in HttpOnly, SameSite cookies; the browser does not receive or store JWTs. Direct signed-storage uploads do not include the API bearer token. Configure private-bucket CORS for the web origin as described in the farm registration guide.

## Implemented surfaces

- Public farmer/investor registration, login, phone/email OTP verification, password reset, and logout.
- Permission-driven dashboards, farmer registry/review/status/history, assisted registration, farms/location/photos, and farm status workflow.
- Field visits and reports, workflow history, report media attachment, field-team assignments, and encrypted offline service-request/report replay.
- KYC creation/review, required-document checklist, masked and explicitly audited raw identifier reads, and signed document upload/download.
- Users, role assignment/expiry, role permission/scope policy, custom permission catalogue, and document type management.
- Farmer archive approvals, audit search, support tickets, crop/season records, and crop activity history.

Offline entries are encrypted with AES-GCM and stored in IndexedDB. Supported replay uses the backend's stable `device_reference` contract. The mounted API has no conflict-resolution endpoint; a `409` remains visibly queued and is not silently overwritten.

The frontend intentionally omits contract-only payments, investments, financing, procurement, global search, notification management, and other routes absent from the current backend URL configuration. Check `/api/v1/schema/` and the frontend implementation guides before adding modules.

## Checks

```bash
npm run lint
npm run build
```
