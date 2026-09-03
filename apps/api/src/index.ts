import { buildApp } from './app.js';
const app = await buildApp();
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });
console.log(`spine api on :${port}`);
