import { z } from "zod";

export const signupSchema = z.object({
  email: z.email("must be a valid email"),
  password: z.string().min(8, "must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.email("must be a valid email"),
  password: z.string().min(1, "password is required"),
});

export const createTodoSchema = z.object({
  text: z.string().min(1, "text is required").max(500, "text is too long"),
  done: z.boolean().optional(),
});

export const updateTodoSchema = z
  .object({
    text: z.string().min(1, "text is required").max(500, "text is too long").optional(),
    done: z.boolean().optional(),
  })
  .refine((data) => data.text !== undefined || data.done !== undefined, {
    message: "At least one field must be provided",
  });
