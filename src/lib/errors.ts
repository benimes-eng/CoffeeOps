export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "CONCURRENT_MODIFICATION"
  | "INSUFFICIENT_CAPACITY"
  | "INSUFFICIENT_STOCK"
  | "INTERNAL_ERROR";

export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function parseSupabaseError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;

  const err = error as { message?: string; details?: string; hint?: string; code?: string };
  const rawMsg = err.message || "An unexpected error occurred";

  if (rawMsg.includes("Over-capacity")) {
    return new DomainError("INSUFFICIENT_CAPACITY", rawMsg);
  }
  if (rawMsg.includes("Insufficient stock")) {
    return new DomainError("INSUFFICIENT_STOCK", rawMsg);
  }
  if (rawMsg.includes("Unauthorized") || rawMsg.includes("JWT")) {
    return new DomainError("UNAUTHORIZED", "Authentication required or session expired.");
  }
  if (rawMsg.includes("permission denied") || rawMsg.includes("Only platform administrators")) {
    return new DomainError("FORBIDDEN", "You do not have permission to perform this action.");
  }
  if (rawMsg.includes("already occupied") || rawMsg.includes("under maintenance")) {
    return new DomainError("CONFLICT", rawMsg);
  }
  if (rawMsg.includes("cannot be merged") || rawMsg.includes("cannot start grinding") || rawMsg.includes("Physical impossibility")) {
    return new DomainError("INVALID_STATE", rawMsg);
  }
  if (rawMsg.includes("Validation error") || rawMsg.includes("chk_")) {
    return new DomainError("VALIDATION_ERROR", rawMsg);
  }

  return new DomainError("INTERNAL_ERROR", rawMsg);
}
