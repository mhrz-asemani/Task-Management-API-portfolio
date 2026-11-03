import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "./error-schema";

export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = `${firstIssue.path.join(".")}: ${firstIssue.message}`;
      return next(new AppError(message, 400, "INVALID_ARGUMENT"));
    }

    req.body = result.data; // replaced with parsed/coerced data
    next();
  };
}
