// Fake S3 / R2 (path-style: /<bucket>/<key>). Signatures are ignored; bodies are stored and recorded.
import { startFake, j } from './common.mjs';
import { createHash } from 'node:crypto';

export async function startFakeS3() {
  const objects = new Map();
  const routes = [
    ['PUT', /^\/([^/]+)\/(.+)$/, (_, c) => { objects.set(`${c.match[1]}/${decodeURIComponent(c.match[2])}`, c.body); return { status: 200, headers: { etag: `"${createHash('md5').update(c.body).digest('hex')}"` } }; }],
    ['GET', /^\/([^/]+)\/(.+)$/, (_, c) => { const o = objects.get(`${c.match[1]}/${decodeURIComponent(c.match[2])}`); return o ? { status: 200, body: o, headers: { 'content-type': 'application/octet-stream' } } : { status: 404, body: '<Error><Code>NoSuchKey</Code></Error>', headers: { 'content-type': 'application/xml' } }; }],
    ['HEAD', /^\/([^/]+)\/(.+)$/, (_, c) => { const o = objects.get(`${c.match[1]}/${decodeURIComponent(c.match[2])}`); return o ? { status: 200, headers: { 'content-length': String(o.length) } } : { status: 404 }; }],
    ['GET', /^\/([^/]+)\/?$/, (_, c) => { const keys = [...objects.keys()].filter((k) => k.startsWith(c.match[1] + '/')).map((k) => k.slice(c.match[1].length + 1)); return { status: 200, headers: { 'content-type': 'application/xml' }, body: `<ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>` }; }],
    ['DELETE', /^\/([^/]+)\/(.+)$/, (_, c) => { objects.delete(`${c.match[1]}/${decodeURIComponent(c.match[2])}`); return { status: 204 }; }],
  ];
  const fake = await startFake(routes, { name: 'fake-s3' });
  fake.objects = objects; fake.j = j;
  return fake;
}
