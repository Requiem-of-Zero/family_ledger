# Family Ledger

Family Ledger is planned as a family management platform for the practical work of running a household. The app will grow beyond finances into a shared place to track fridge inventory, cooking plans, household supplies, recipes, expenses, and income.

The current app is a Next.js and PostgreSQL foundation with authentication, Prisma models, seeded demo data, and early expense/income tracking.

## Prerequisites

- Node.js
- Yarn 1.x
- PostgreSQL

## Getting Started

1. Start PostgreSQL.

   ```bash
   sudo systemctl start postgresql
   ```

2. Create a local PostgreSQL role if you do not already have one.

   This project works well locally when your PostgreSQL role matches your Linux username.

   ```bash
   sudo -iu postgres createuser --interactive
   ```

   For local development, you can make the role a superuser when prompted.

3. Create the local database.

   ```bash
   createdb family_ledger
   ```

   You can confirm it exists with:

   ```bash
   psql -l
   ```

4. Set a password for your local PostgreSQL role.

   ```bash
   psql -d family_ledger
   ```

   Then run:

   ```sql
   ALTER ROLE your_username WITH PASSWORD 'dev_password';
   \q
   ```

5. Create a `.env` file in the project root.

   ```bash
   DATABASE_URL="postgresql://your_username:dev_password@localhost:5432/family_ledger?schema=public"
   APP_URL="http://localhost:3000"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

   Replace `your_username` and `dev_password` with your local PostgreSQL role and password.

   Prisma should use the explicit `localhost:5432` connection string above. A socket-style URL such as `postgresql:///family_ledger` may work with `psql`, but Prisma can fail with a `P1010` access error.

   Google OAuth is optional for basic local startup. If you are testing Google sign-in, also add:

   ```bash
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
   ```

6. Install dependencies.

   ```bash
   yarn install
   ```

   Prisma runs during `postinstall`, so `.env` and `DATABASE_URL` must exist before installing dependencies.

7. Create the database tables.

   ```bash
   yarn prisma db push
   ```

8. Seed local demo data.

   ```bash
   yarn prisma db seed
   ```

   This creates a test user:

   ```text
   email: test@example.com
   password: password123
   ```

9. Start the dev server.

   ```bash
   yarn dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Verifying the Database

Connect to the local database:

```bash
psql -d family_ledger
```

List tables:

```sql
\d
```

After `yarn prisma db push`, you should see tables such as `User`, `Session`, `Family`, `Transaction`, and `TransactionCategory`.

## Troubleshooting

### `next: command not found`

This means project dependencies are not installed, so `node_modules/.bin/next` does not exist yet.

Run:

```bash
yarn install
yarn dev
```

### `Cannot resolve environment variable: DATABASE_URL`

Prisma loads `DATABASE_URL` during dependency installation because `postinstall` runs `prisma generate`.

Create `.env` first, then rerun:

```bash
yarn install
```

### `P1010: User was denied access on the database`

If `psql` connects but Prisma fails, check that `DATABASE_URL` uses an explicit host, port, username, and password:

```bash
DATABASE_URL="postgresql://your_username:dev_password@localhost:5432/family_ledger?schema=public"
```

Avoid this form for Prisma:

```bash
DATABASE_URL="postgresql:///family_ledger"
```

### Package Managers

This setup currently uses Yarn commands because the local environment was bootstrapped with `yarn install`.

The repo should use one package manager consistently. If Yarn is the choice, commit `yarn.lock` and avoid updating `package-lock.json`. If npm is the choice, remove `yarn.lock` and use `npm ci`, `npx prisma db push`, and `npm run dev`.

## Common Commands

```bash
yarn dev             # start the Next.js dev server
yarn build           # generate Prisma client and build the app
yarn lint            # run ESLint
yarn test            # run Vitest
yarn prisma db push  # sync Prisma schema to the local database
yarn prisma db seed  # seed local demo data
```
