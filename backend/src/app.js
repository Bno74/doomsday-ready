import express from 'express';
import cors from 'cors';
import { ApiError, notFound } from './errors.js';
import { parseGroupSize, parseId } from './validation.js';
import * as svc from './services.js';

/** Resolve `:id` from the URL, or 404 (an id that is not a positive integer cannot exist). */
function idParam(req, what) {
  const id = parseId(req.params.id);
  if (id === null) throw notFound(what);
  return id;
}

/**
 * Build the Express app around a store. Kept separate from `server.js`
 * so tests can run it on any port with an in-memory store.
 */
export function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ status: 'ok' }));

  /* ---- movies ---- */
  api.post('/movies', (req, res) => res.status(201).json(svc.createMovies(store, req.body)));
  api.get('/movies', (_req, res) => res.json(svc.listMovies(store)));
  api.get('/movies/:id', (req, res) => res.json(svc.getMovie(store, idParam(req, 'Movie'))));
  api.patch('/movies/:id', (req, res) =>
    res.json(svc.updateMovie(store, idParam(req, 'Movie'), req.body)),
  );
  api.get('/movies/:id/rewatch-order', (req, res) =>
    res.json(svc.getRewatchOrder(store, idParam(req, 'Movie'))),
  );

  /* ---- cinemas ---- */
  api.post('/cinemas', (req, res) => res.status(201).json(svc.createCinemas(store, req.body)));
  api.get('/cinemas', (_req, res) => res.json(svc.listCinemas(store)));
  api.get('/cinemas/:id', (req, res) => res.json(svc.getCinema(store, idParam(req, 'Cinema'))));
  api.get('/cinemas/:id/booking', (req, res) => {
    const id = idParam(req, 'Cinema');
    const groupSize = parseGroupSize(req.query.groupSize);
    res.json(svc.getBookingQuote(store, id, groupSize));
  });

  api.use((req, _res, next) => next(notFound(`Route ${req.method} ${req.originalUrl}`)));
  app.use('/api', api);
  app.use((req, _res, next) => next(notFound(`Route ${req.method} ${req.originalUrl}`)));

  // Every error leaves the API in the same shape: { error: { code, message, details? } }
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res
        .status(err.status)
        .json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    }
    if (err?.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    }
    console.error(err);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  return app;
}
