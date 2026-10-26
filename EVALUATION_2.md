# Evaluation 2 walkthrough

## Architecture

- View: frontend/ contains the browser app. Home and Guides play the Evaluation 2 video with captions and chapter times.
- Model: backend/models/index.js defines users, private canvases, published artwork, follows, reactions, comments, reports and activity. backend/models/projectValidation.js checks canvas payloads.
- Controller: backend/controllers/projectsController.js handles owner-scoped cloud project CRUD. backend/controllers/healthController.js reports MongoDB readiness.
- Routes: backend/routes/index.js mounts accounts, projects, Gallery, contact and notifications. backend/app.js configures Express middleware and errors. api/index.js exposes the same app on Vercel.

The browser requests /api from its own origin. MongoDB Atlas is contacted by Express through server-only MONGO_URI.

## Suggested live demonstration

1. Open Home or Guides and play the Evaluation 2 tour.
2. Draw on a blank canvas. Add an animation frame, open Studio, and create a pixel reference from an image.
3. Sign in using a disposable verified account. Save a private project, reopen it, update it, and delete it.
4. Publish a fixed copy. Browse it in the Gallery and on the artist profile. Search, react, comment, follow and inspect activity.
5. Show /api/health reporting database: connected in the target environment.
6. Import postman/PixelVerse-Evaluation-2.postman_collection.json. Set baseUrl and disposable account credentials in Postman variables, then run its health, login and project CRUD requests in order. The collection deletes the test project at the end.

POST /api/projects creates, GET /api/projects lists, GET /api/projects/:id reads, PUT /api/projects/:id updates, and DELETE /api/projects/:id removes an owner's private canvas. Requests without a valid access token receive 401.

## Verification

Run npm run build and npm test before presenting. Database integration tests require MONGO_TEST_URI to select the disposable pixelverse_m2_integration_test database. A source push does not update an existing deployment; deploy only after a separate decision.
