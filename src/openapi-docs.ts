import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Request, Response, Router } from "express";

const router = Router();
const specPath = resolve(process.cwd(), "openapi.json");

router.get("/openapi.json", (_req: Request, res: Response) => {
  try {
    const spec = readFileSync(specPath, "utf8");
    // Parse before serving so a malformed file fails clearly instead of reaching Swagger UI.
    JSON.parse(spec);
    res.type("application/json").send(spec);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 500,
        message: "OpenAPI specification is unavailable",
        status: "INTERNAL",
      },
    });
  }
});

router.get("/api-docs", (_req: Request, res: Response) => {
  // This page intentionally uses the pinned Swagger UI CDN assets. The route-specific CSP
  // permits only those assets, inline initialization, and API requests to the documented origins.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "script-src 'unsafe-inline' https://unpkg.com",
      "style-src 'unsafe-inline' https://unpkg.com",
      "img-src data: https://unpkg.com",
      "font-src data: https://unpkg.com",
      "connect-src 'self' https://todo-api-ule1.onrender.com http://localhost:3000",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Task Management API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>body { margin: 0; background: #fafafa; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        withCredentials: true,
        validatorUrl: null,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`);
});

export default router;
