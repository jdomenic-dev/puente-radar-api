# Auth plan: login with Google and Facebook to report

**Status: plan only, nothing implemented.** It is the next feature after the app contract work.

## Decision

Only people who want to **report** need an account. They sign in with **Google or Facebook, and
nothing else**. Reading (bridges, estimates, overview) does not require login.

## Flow

The mobile app obtains the provider credential natively and the API verifies it; the API never
sees a password.

```
App  --(Google ID token | Facebook token)-->  POST /auth/google | /auth/facebook
API  verifies with the provider, upserts the user, returns { accessToken, refreshToken, user }
App  sends  Authorization: Bearer <accessToken>  on POST /reports
```

| Endpoint              | Purpose                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/google`   | Body `{ idToken }`. Verified with `google-auth-library`; the audience must be one of our client IDs (iOS, Android, web)                                                                                     |
| `POST /auth/facebook` | Body `{ accessToken }` (Android / classic login) or `{ idToken }` (iOS Limited Login, an OIDC JWT verified against Facebook's keys). Access tokens are checked with Graph `debug_token` using our app token |
| `POST /auth/refresh`  | Rotates the refresh token and returns a new access token                                                                                                                                                    |
| `POST /auth/logout`   | Revokes the refresh token                                                                                                                                                                                   |
| `GET /auth/me`        | Current user                                                                                                                                                                                                |
| `DELETE /auth/me`     | Deletes the account (see risks)                                                                                                                                                                             |

## Data

- `users`: `id` (uuid), `provider` (`google` | `facebook`), `providerUserId`, `email` (nullable,
  Facebook may not return it), `displayName`, `createdAt`, `lastLoginAt`, `isBanned`. Unique on
  (`provider`, `providerUserId`).
- `refresh_tokens`: token **hash** (never the token), `userId`, `expiresAt`, `revokedAt`,
  rotation chain.
- `reports.userId`: nullable FK. Existing anonymous reports stay as they are; new reports require
  a user. `anonymousDeviceId` stays for rate limiting and abuse analysis.
- No automatic account linking by email in the MVP: the same person using both providers has two
  accounts (Facebook may not give an email, and trusting an unverified email is an account-takeover risk).

## Server

- Short-lived access JWT (about 15 minutes) plus rotating, revocable refresh tokens.
- A `JwtAuthGuard` on `POST /reports` (today it is `@Public()` with a 5 per minute IP throttle).
  Throttle per user as well, plus a daily cap, and let a banned user be rejected.
- Secrets (`JWT_SECRET`, Facebook app secret, Google client IDs) in the environment or SSM, never in
  the repo. They must be added to `env.validation.ts` and required in production.
- The global `x-api-key` guard keeps protecting the other routes; the `/auth/*` endpoints and
  `POST /reports` need their own policy and tests (`authorization-policy.spec.ts` already exists).
- Reports remain anonymous to other users: the app never shows who reported.

## App side

- Native Google Sign-In and the Facebook SDK **do not run in Expo Go**: a development build or EAS
  build is required to test login.
- The access token goes in `expo-secure-store` (already a dependency), never in AsyncStorage.
- "Reportar mi fila" shows a login sheet when there is no session, then continues the report.

## Risks and open decisions (confirm before release)

1. **Apple.** App Store Review Guideline 4.8 generally asks apps that offer third-party social
   login to also offer an equivalent privacy-preserving option, typically Sign in with Apple. With
   Google and Facebook only, iOS review may reject the app. Confirm the current wording of the
   guideline and decide whether to add Apple, or to qualify for an exception.
2. **Account deletion.** Apple requires in-app account deletion when an app creates accounts, and
   Facebook requires a data deletion URL or callback. Hence `DELETE /auth/me` and a privacy policy.
3. **Facebook app review.** A live Facebook app needs a privacy policy URL, may need business
   verification, and `email` is not guaranteed. Plan for lead time.
4. **Decisions for the owner:** keep reads open (assumed yes); end anonymous reporting (assumed yes,
   which loses some volume); whether to show the reporter's name anywhere (assumed no).
