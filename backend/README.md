# Backend (MVC model and controller)

app.js configures Express middleware and error handling. routes/index.js mounts account, private project, Gallery, contact and activity routes. routes/projects.js maps HTTP methods to controllers/projectsController.js; controllers/healthController.js reports database readiness. models/index.js defines the Mongoose schemas and indexes, and models/projectValidation.js validates saved canvas data. index.js starts the local API; ../api/index.js is the Vercel entry point.

Set MONGO_URI and a unique JWT_SECRET in a private environment file. The frontend calls /api; it never connects to MongoDB directly.
