import 'dotenv/config';
import { buildApp } from './server.js';

const start = async () => {
  const app = await buildApp();
  await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' });
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
