import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./mapa-convento.html', import.meta.url));
const port = process.env.PORT || 3000;

createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(port, () => console.log('listening on', port));
