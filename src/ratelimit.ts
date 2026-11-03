import rateLimit from "express-rate-limit";

const generalLimitObj = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 429,
      message: "Too many requests, please try again later",
      status: "RESOURCE_EXHAUSTED",
    },
  },
};

// a general limiter for most routes
export const generalLimiter = rateLimit(generalLimitObj);

// a stricter limiter for auth routes
export const authLimiter = rateLimit({
  ...generalLimitObj,
  max: 10,
});
