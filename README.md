# Everyday Tee preorder site

The customer page accepts shirt options, delivery or pickup, and a payment-slip image. Orders and private slips are stored in Supabase. The admin page is `admin.html`; an admin can review orders, open slips, update payment status, upload the store QR, and set pickup instructions.

## Set up Supabase

1. Create a Supabase project.
2. In **Project Settings → API**, copy the project URL and the publishable/anon key into a local `.env` file using `.env.example` as the template. Never put a `service_role` or secret key in this app.
3. Run `supabase/migrations/202611180001_store.sql` in the Supabase SQL Editor.
4. In **Authentication → Providers / Sign In**, enable anonymous sign-ins. Customers use anonymous accounts to associate their uploaded slip and order without requiring an email address.
5. In **Authentication → URL Configuration**, add the local development URL and the production website URL to the allowed redirect/site URLs.
6. Create an admin user in **Authentication → Users** with email and password. Copy its user UUID, then run:

   ```sql
   insert into public.store_admins (user_id)
   values ('ADMIN-USER-UUID');
   ```

7. Install dependencies and start the site:

   ```sh
   npm install
   npm run dev
   ```

Open the printed local URL for customers and append `/admin.html` for the admin dashboard. Deploy the built `dist` directory to a static host after adding the same environment variables there.

## Deploy with GitHub Pages

1. Push this project to the `main` branch of a GitHub repository.
2. In **Settings → Secrets and variables → Actions**, add the secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the project URL and publishable/anon key from Supabase. Never add a service-role or secret key.
3. In **Settings → Pages**, set the source to **GitHub Actions**.
4. The workflow builds both the storefront and `admin.html` using the repository path, then deploys `dist`. After deployment, open the Pages URL; the admin page is at `/admin.html` under that site.
5. Add the deployed Pages URL to Supabase **Authentication → URL Configuration**. Ensure the database migration is applied and anonymous sign-ins are enabled as described above.

The public browser key is protected by the database and storage row-level security policies in the migration. Keep the Supabase service-role key private and never add it to `.env` variables prefixed with `VITE_`.
