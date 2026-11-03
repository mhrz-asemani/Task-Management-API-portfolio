import express, { Request, Response } from "express";
import http from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { pool } from "./db";
import authRouter from "./auth";
import { requireAuth, AuthRequest } from "./middleware";
import jwt from "jsonwebtoken";
import { upload } from "./upload";
import cloudinary from "./cloudinary";
import * as cookie from "cookie";
import { asyncHandler } from "./asyncHandler";
import { AppError } from "./error-schema";
import { errorHandler } from "./errorHandler";
import { validate } from "./validate";
import { createTodoSchema, updateTodoSchema } from "./form-schemas";
import { generalLimiter } from "./ratelimit";
import { logger } from "./logger";
import { env } from "./env";
import { originGuard } from "./originGuard";
import openApiDocsRouter from "./openapi-docs";
import { listTodos, createTodo, updateTodo, deleteTodo } from "./todo-service";

export const app = express();

app.use(helmet());
app.use(pinoHttp({ logger }));
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(originGuard);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use(generalLimiter);
app.use(openApiDocsRouter);

export const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: env.FRONTEND_ORIGIN, credentials: true },
});

io.on("connection", (socket) => {
  const rawCookie = socket.handshake.headers.cookie;
  if (!rawCookie) {
    socket.disconnect();
    return;
  }

  const parsedCookie = cookie.parse(rawCookie);
  const accessToken = parsedCookie.accessToken;
  if (!accessToken) {
    socket.disconnect();
    return;
  }

  try {
    const decoded = jwt.verify(accessToken, env.JWT_SECRET) as {
      userId: number;
    };
    socket.join(`user:${decoded.userId}`);
    logger.info(
      { socketId: socket.id, userId: decoded.userId },
      "Socket joined room",
    );
  } catch {
    logger.warn({ socketId: socket.id }, "Socket disconnected: invalid token");
    socket.disconnect();
    return;
  }

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "Socket disconnected");
  });
});

app.use("/auth", authRouter);

// Liveness reports whether the API process can answer HTTP requests.
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "alive" });
});

// Readiness also verifies the dependency required to serve application requests.
app.get("/readyz", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready", checks: { database: "ok" } });
  } catch (err) {
    logger.warn({ err }, "Readiness check failed: database unavailable");
    res.status(503).json({
      status: "not_ready",
      checks: { database: "unavailable" },
    });
  }
});

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});

app.get(
  "/todos",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const todos = await listTodos(req.userId!);
    res.json(todos);
  }),
);

app.post(
  "/todos",
  requireAuth,
  validate(createTodoSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { text, done } = req.body;
    const newTodo = await createTodo(req.userId!, text, done);
    io.to(`user:${req.userId}`).emit("todo:created", newTodo);
    res.status(201).json(newTodo);
  }),
);

app.post(
  "/todos/:id/image",
  requireAuth,
  upload.single("image"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    const image = req.file;
    if (!image)
      throw new AppError("image file is required", 400, "INVALID_ARGUMENT");

    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "todo-images" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
      stream.end(image.buffer);
    });

    const result = await pool.query(
      "UPDATE todos SET image_url = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [uploadResult.secure_url, id, req.userId],
    );

    if (result.rows.length === 0)
      throw new AppError("Todo not found", 404, "NOT_FOUND");

    io.to(`user:${req.userId}`).emit("todo:updated", result.rows[0]);
    res.json(result.rows[0]);
  }),
);

app.put(
  "/todos/:id",
  requireAuth,
  validate(updateTodoSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    const updatedTodo = await updateTodo(req.userId!, id, req.body);
    io.to(`user:${req.userId}`).emit("todo:updated", updatedTodo);
    res.json(updatedTodo);
  }),
);

app.delete(
  "/todos/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    await deleteTodo(req.userId!, id);
    io.to(`user:${req.userId}`).emit("todo:deleted", { id });
    res.status(204).send();
  }),
);

app.use(errorHandler);
