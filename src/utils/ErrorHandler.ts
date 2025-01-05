import winston from "winston";
import { GameError } from "./GameError";

export class ErrorHandler {
  private static logger = winston.createLogger({
    level: "error",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({ filename: "error.log" }),
      new winston.transports.Console(),
    ],
  });

  static handleError(error: Error, context: string, playerId?: string) {
    const errorDetails = {
      context,
      playerId,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(errorDetails);

    if (error instanceof GameError) {
      return error;
    }

    return new GameError("An unexpected error occurred");
  }

  static logWarning(message: string, context: string, data?: any) {
    this.logger.warn({
      context,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}
