# Frontend (MVC view)

This folder is the real browser application: the original PixelVerse HTML pages, retro CSS, drawing modules, and static assets. Vite serves it during development and builds it into `../dist` for deployment. Browser requests use same-origin `/api` in production; the local Vite proxy forwards `/api` to Express during development. The browser does not connect directly to MongoDB.
