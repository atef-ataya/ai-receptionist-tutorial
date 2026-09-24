import type { ApiErrorCode } from "../shared/contracts.js";

export class AppError extends Error {
  constructor(public status: number, public code: ApiErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

export function statusForError(error: unknown) {
  return error instanceof AppError ? error.status : 500;
}
