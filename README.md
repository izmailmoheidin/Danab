# Danab

Monorepo containing the two Danab apps.

## Projects

| Folder | Description | Deploy on Vercel as |
|---|---|---|
| [`danab-admin-main/`](./danab-admin-main) | Next.js admin dashboard (stations, transactions, revenue, station comparison) | Root Directory: `danab-admin-main` |
| [`PaymentSystem-main/`](./PaymentSystem-main) | Next.js customer-facing payment flow + landing | Root Directory: `PaymentSystem-main` |

## Local development

Each app has its own `package.json`:

```bash
cd danab-admin-main && npm install && npm run dev    # admin (port 3001)
cd PaymentSystem-main && npm install && npm run dev  # payment (port 3002)
```

Environment variables for each app must live in:
- `danab-admin-main/.env`
- `PaymentSystem-main/local.env`

These files are **gitignored** — never commit them. See `.env.local.example` for the admin keys.

## Deployment

1. **Vercel:** create two projects from this same GitHub repo, each with a different *Root Directory* (see table above). Paste the env vars from your local files into Vercel → Settings → Environment Variables.
2. **Firestore indexes:** run once per environment:
   ```bash
   firebase deploy --only firestore:indexes --project danab-74939 \
     --config danab-admin-main/firebase.json
   ```

## Notes

- Admin reads/writes Firestore via the `FIREBASE_CREDENTIALS_B64` service account.
- Customer page polls `/api/mobile/stations` (payment system) for live battery counts; admin uses `/api/heycharge/live` for the operator view.
- HeyCharge 402/401/403 are mapped to **Offline** rather than surfaced as errors.
