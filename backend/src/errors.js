/** An error that maps directly onto an HTTP response. */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code stable machine-readable code, e.g. CIRCULAR_DEPENDENCY
   * @param {string} message human-readable explanation
   * @param {unknown} [details] optional extra data (e.g. per-field errors)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const validationError = (message, details) =>
  new ApiError(400, 'VALIDATION_ERROR', message, details);

export const notFound = (what) => new ApiError(404, 'NOT_FOUND', `${what} not found`);
