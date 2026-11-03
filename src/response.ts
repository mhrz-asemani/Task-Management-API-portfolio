import { Response } from "express";

export const sendSuccess = (res: Response, statusCode: number = 200, data: any) => {
    res.status(statusCode).json({
        success: true,
        data: data
    });
};