export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    return new AppError('INVALID_JSON', 'Некорректный формат запроса.', 400);
  }
  return new AppError('NETWORK_ERROR', 'Не удалось связаться с сервисом. Попробуйте ещё раз.', 502);
}
