export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication is required.') => (
  new AppError(401, 'UNAUTHORIZED', message)
);
export const forbidden = (message = 'You do not have permission to perform this action.') => (
  new AppError(403, 'FORBIDDEN', message)
);
export const conflict = (code, message) => new AppError(409, code, message);
export const gone = (code, message) => new AppError(410, code, message);

export function errorHandler(error, _request, response, _next) {
  if (error instanceof AppError) {
    return response.status(error.status).json({ code: error.code, message: error.message });
  }

  if (error?.type === 'entity.parse.failed') {
    return response.status(400).json({
      code: 'INVALID_JSON',
      message: 'Request body must contain valid JSON.',
    });
  }

  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return response.status(413).json({
      code: 'REQUEST_BODY_TOO_LARGE',
      message: 'Request body exceeds the configured limit.',
    });
  }

  // Request bodies and error objects are deliberately not logged here. The
  // production logger added with BE-16 must use an explicit secret-redaction
  // policy before receiving any request context.
  console.error('Unhandled API error', {
    name: error?.name ?? 'Error',
    code: error?.code ?? 'UNKNOWN',
  });
  return response.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'The request could not be completed.',
  });
}
