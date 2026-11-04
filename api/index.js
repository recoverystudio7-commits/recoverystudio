import { requestHandler } from '../server.js';

/**
 * Vercel enruta todo /api/* a esta única función mediante un rewrite.
 * El rewrite entrega el subpath en __rs_path; lo devolvemos a req.url para
 * que server.js resuelva la ruta como si fuera un servidor Node normal.
 */
export default function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://local');
    const sub = url.searchParams.get('__rs_path');
    if (sub !== null) {
      url.searchParams.delete('__rs_path');
      const qs = url.searchParams.toString();
      req.url = '/api/' + sub + (qs ? '?' + qs : '');
    }
  } catch {
    /* si algo falla, server.js responderá 404 */
  }
  return requestHandler(req, res);
}

export const config = {
  maxDuration: 30,
};
