import { pool } from "./db";
import { AppError } from "./error-schema";

export interface UpdateTodoInput {
  text?: string;
  done?: boolean;
}

/**
 * Data access and ownership-aware todo operations.
 * HTTP status handling and Socket.IO notifications stay in the route layer.
 */
export async function listTodos(userId: number) {
  const result = await pool.query(
    "SELECT * FROM todos WHERE user_id = $1 ORDER BY id",
    [userId],
  );

  return result.rows;
}

export async function createTodo(
  userId: number,
  text: string,
  done: boolean = false,
) {
  const result = await pool.query(
    "INSERT INTO todos (text, done, user_id) VALUES ($1, $2, $3) RETURNING *",
    [text, done, userId],
  );

  return result.rows[0];
}

export async function updateTodo(
  userId: number,
  todoId: number,
  input: UpdateTodoInput,
) {
  const existing = await pool.query(
    "SELECT * FROM todos WHERE id = $1 AND user_id = $2",
    [todoId, userId],
  );

  if (existing.rows.length === 0) {
    throw new AppError("Todo not found", 404, "NOT_FOUND");
  }

  const current = existing.rows[0];
  const text = input.text ?? current.text;
  const done = input.done ?? current.done;

  const result = await pool.query(
    "UPDATE todos SET text = $1, done = $2 WHERE id = $3 AND user_id = $4 RETURNING *",
    [text, done, todoId, userId],
  );

  if (result.rows.length === 0) {
    throw new AppError("Todo not found", 404, "NOT_FOUND");
  }

  return result.rows[0];
}

export async function deleteTodo(userId: number, todoId: number) {
  await pool.query("DELETE FROM todos WHERE id = $1 AND user_id = $2", [
    todoId,
    userId,
  ]);
}
