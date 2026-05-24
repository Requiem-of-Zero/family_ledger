# Family Ledger

A Next.js app for tracking family income and expenses.

## Prerequisites

- Node.js
- npm
- PostgreSQL

This repo currently uses npm as its package manager. The committed lockfile is `package-lock.json`, so prefer `npm ci` for a clean install.

## Getting Started

1. Create a local PostgreSQL database.

   ```bash
   createdb family_ledger
   ```

2. Create a `.env` file in the project root.

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/family_ledger"
   APP_URL="http://localhost:3000"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

   Replace `USER` and `PASSWORD` with your local PostgreSQL credentials. If your local database does not require a password, use the connection URL format that matches your setup.

   Google OAuth is optional for basic local startup. If you are testing Google sign-in, also add:

   ```bash
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
   ```

3. Install dependencies.

   ```bash
   npm ci
   ```

   Prisma runs during `postinstall`, so `DATABASE_URL` must exist before installing dependencies.

4. Create the database tables.

   ```bash
   npx prisma db push
   ```

5. Optional: seed local demo data.

   ```bash
   npx prisma db seed
   ```

   This creates a test user:

   ```text
   email: test@example.com
   password: password123
   ```

6. Start the dev server.

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Troubleshooting

### `next: command not found`

This means project dependencies are not installed, so `node_modules/.bin/next` does not exist yet.

Run:

```bash
npm ci
npm run dev
```

### `Cannot resolve environment variable: DATABASE_URL`

Prisma loads `DATABASE_URL` during dependency installation because `postinstall` runs `prisma generate`.

Create `.env` first, then rerun:

```bash
npm ci
```

### Using Yarn

`yarn dev` works only after dependencies have been installed. However, this repo has `package-lock.json`, not `yarn.lock`, so npm is the recommended path.

If you intentionally switch to Yarn, use it consistently and commit the resulting `yarn.lock`.

## Common Commands

```bash
npm run dev       # start the Next.js dev server
npm run build     # generate Prisma client and build the app
npm run lint      # run ESLint
npm test          # run Vitest
```
