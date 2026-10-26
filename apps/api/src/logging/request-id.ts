import type { IncomingMessage, ServerResponse } from 'node:http';

import { v7 } from 'uuid';

const CLIENT_ID = /^[\w.:-]{1,128}$/;

/** Honours a well-formed client X-Request-Id, otherwise generates one, and echoes it back. */
export function genRequestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const fromClient = Array.isArray(header) ? header[0] : header;
  const id = fromClient && CLIENT_ID.test(fromClient) ? fromClient : `req_${v7()}`;
  res.setHeader('X-Request-Id', id);
  return id;
}
