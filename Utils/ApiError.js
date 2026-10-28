export class ApiError extends Error {
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
  static badRequest(msg = 'Bad request', code = 'BAD_REQUEST') { return new ApiError(400, msg, code); }
  static unauthorized(msg = 'Not authenticated', code = 'UNAUTHORIZED') { return new ApiError(401, msg, code); }
  static forbidden(msg = 'Forbidden', code = 'FORBIDDEN') { return new ApiError(403, msg, code); }
  static notFound(msg = 'Not found', code = 'NOT_FOUND') { return new ApiError(404, msg, code); }
  static conflict(msg = 'Conflict', code = 'CONFLICT') { return new ApiError(409, msg, code); }
  static notImplemented(msg = 'Not implemented', code = 'NOT_IMPLEMENTED') { return new ApiError(501, msg, code); }
}
