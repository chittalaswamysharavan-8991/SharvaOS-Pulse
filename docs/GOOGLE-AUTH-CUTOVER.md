# Google Sign-In cutover

## Goal

Make Google OAuth the primary SharvaOS Pulse sign-in while preserving the existing owner account, canonical Supabase user ID, offline queue, and email OTP as a temporary recovery path.

## Implemented in code

- Supabase Google authorize flow using `/auth/v1/authorize?provider=google`.
- OAuth session capture, validation, persistence, refresh, sign-out, and URL-fragment cleanup.
- Public provider-readiness check through `/auth/v1/settings`.
- Google-first UI when the provider is enabled; owner email recovery when it is not.
- A private owner registry seeded from the single confirmed existing Auth user.
- Restrictive canonical read policies and row-level mutation triggers that reject every non-owner UUID.
- A Before User Created hook function that rejects all new Supabase users.
- No Google client secret, owner email, OAuth token, or personal record in the repository.

## Secure provider activation

Create a Google Cloud OAuth client of type **Web application**.

Authorized JavaScript origin:

```text
https://sharvaos-pulse.vercel.app
```

Authorized redirect URI:

```text
https://vhzzugeeadaijkzrvowx.supabase.co/auth/v1/callback
```

In Supabase Authentication → Providers → Google:

1. Enable Google.
2. Enter the Google Web Client ID.
3. Enter the Google Client Secret.
4. Keep nonce verification enabled.

In Supabase Authentication → URL Configuration:

- Site URL: `https://sharvaos-pulse.vercel.app`
- Redirect allow list: `https://sharvaos-pulse.vercel.app`

In Supabase Authentication → Hooks:

- Enable **Before User Created**.
- Select Postgres function `public.hook_reject_new_pulse_users`.

The secret belongs only in Supabase provider configuration. Do not place it in GitHub, Vercel, Slack, chat, screenshots, or client-side environment variables.

## First owner sign-in

Use the Google account whose verified email exactly matches the existing confirmed Supabase owner email. Supabase automatic identity linking should attach the Google identity to the same Auth user UUID, preserving all canonical ownership and RLS relationships.

After sign-in verify:

- Auth user count remains `1`.
- The owner has both `email` and `google` identities.
- Today loads from the existing canonical rows.
- A canary write, read-back, offline replay, and cleanup pass.

Email OTP recovery should remain available until the Google identity and iPhone acceptance are confirmed. Remove it only in a separate reviewed change.
