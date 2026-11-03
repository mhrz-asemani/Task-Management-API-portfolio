const fs = require("node:fs");
const path = require("node:path");

const specPath = path.resolve(__dirname, "..", "openapi.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(`OpenAPI validation failed: ${message}`);
  }
}

assert(spec.openapi === "3.1.0", "openapi must be 3.1.0");
assert(typeof spec.info?.title === "string" && spec.info.title.length > 0, "info.title is required");
assert(typeof spec.info?.version === "string" && spec.info.version.length > 0, "info.version is required");
assert(Array.isArray(spec.servers) && spec.servers.length > 0, "at least one server is required");
assert(spec.paths && typeof spec.paths === "object", "paths is required");
assert(spec.components?.schemas && typeof spec.components.schemas === "object", "components.schemas is required");
assert(spec.components?.securitySchemes?.accessCookie?.in === "cookie", "access cookie security scheme is required");
assert(spec.components?.securitySchemes?.refreshCookie?.in === "cookie", "refresh cookie security scheme is required");

const requiredOperations = [
  ["GET", "/"],
  ["GET", "/healthz"],
  ["GET", "/readyz"],
  ["POST", "/auth/signup"],
  ["POST", "/auth/login"],
  ["POST", "/auth/refresh"],
  ["POST", "/auth/logout"],
  ["GET", "/todos"],
  ["POST", "/todos"],
  ["PUT", "/todos/{id}"],
  ["DELETE", "/todos/{id}"],
  ["POST", "/todos/{id}/image"],
];

for (const [method, route] of requiredOperations) {
  const operation = spec.paths[route]?.[method.toLowerCase()];
  assert(operation && typeof operation.operationId === "string", `${method} ${route} must have an operationId`);
  assert(operation.responses && Object.keys(operation.responses).length > 0, `${method} ${route} must define responses`);
}

for (const [route, pathItem] of Object.entries(spec.paths)) {
  for (const method of ["get", "post", "put", "patch", "delete", "options", "head", "trace"]) {
    const operation = pathItem[method];
    if (!operation) continue;
    for (const response of Object.values(operation.responses ?? {})) {
      const schema = response?.content?.["application/json"]?.schema;
      if (schema?.$ref) {
        assert(schema.$ref.startsWith("#/components/"), `${method.toUpperCase()} ${route} has a non-local response schema reference`);
      }
    }
  }
}

console.log(`OpenAPI JSON is valid and includes ${requiredOperations.length} required operations.`);
