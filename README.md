# PixelVerse — Evaluation 2

PixelVerse is a pixel art editor with animation, image references, account-backed cloud projects, publishing, a public Gallery, and artist profiles. This repository contains a Vite frontend and an Express API backed by MongoDB.

## Project layout

| Path | Purpose |
| --- | --- |
| frontend/ | Browser pages, drawing tools, Studio, Gallery, account and publishing UI |
| backend/ | Express app, API routes, controllers, Mongoose models, authentication and mail |
| api/ | Vercel entry point for the same Express app |
| tests/ | Unit and integration tests |
| postman/PixelVerse-Evaluation-2.postman_collection.json | API health, authentication and private project CRUD checks |
| frontend/public/tutorial/ | Evaluation 2 video, captions, poster and chapter times |

The frontend calls same-origin /api; Vite proxies that path to the local API in development. MongoDB credentials stay on the server.

## Local setup

1. Install Node.js 20 or later and MongoDB, then run npm ci.
2. Create a private .env file with a local or Atlas MONGO_URI, a unique JWT_SECRET of at least 32 characters, CLIENT_ORIGINS and APP_ORIGIN. Keep .env private.
3. Run npm run dev for the frontend and API. See the frontend and backend READMEs for their folder roles.

npm run build creates the ignored dist/ directory. npm test runs unit tests and skips database integration tests unless MONGO_TEST_URI points to the disposable pixelverse_m2_integration_test database. Never point tests at a database containing real data.

## Evaluation 2 demonstration

1. Draw on the blank canvas, add frames, use Studio, and convert an image into a drawing reference.
2. Create or sign in to an account, then save, reopen, update and delete a private cloud project.
3. Publish a fixed copy, browse the Gallery, search artwork and artists, open an artist profile, and follow an artist.
4. Watch the Evaluation 2 tour on Home or Guides. The video and captions are committed with the source.
5. Import the focused Postman collection and run its requests in order with a disposable verified account.

See EVALUATION_2.md for an API and MVC walkthrough. This source update does not deploy the app; deployment requires a separate action.

## API and data safety

Passwords are salted and hashed. The API verifies Google identity tokens server-side, issues access tokens, and keeps private cloud projects owner-scoped. Publishing stores a fixed snapshot; later edits to the private canvas do not change it. The Gallery supports visibility controls, reactions, comments, saved art, moderation, artist search, profiles, follows and activity notifications.

Do not commit .env files, local MongoDB directories, backups, node_modules/, dist/, or credentials entered in Postman variables. The root .gitignore excludes local environment and data paths.
