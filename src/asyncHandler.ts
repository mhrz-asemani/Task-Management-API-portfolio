/**
 * A wrapper to catch async errors automatically
 * this wraps any async route handler, if it throws or rejects, the error gets automatically forwarded to Express's error-handling system via next(err)
*/
import { Request, Response, NextFunction, RequestHandler } from "express";

export function asyncHandler(fn: RequestHandler) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    }
}