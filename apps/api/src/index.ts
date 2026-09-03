import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import routes from './routes/index.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' } });
await app.register(cors, { origin: true });
// Lets a PDF be dragged in live on stage; the file takes the same ingress as any package.
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 20 } });
await app.register(routes);

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });
console.log(`spine api on :${port}`);
