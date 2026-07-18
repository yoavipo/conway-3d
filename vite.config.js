import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only sink for window.__capture: collects rendered frames as JPEGs so a
// run can be assembled into a GIF/video. Writes to node_modules/.conway-frames.
const frameSink = {
  name: 'conway-frame-sink',
  configureServer(server) {
    server.middlewares.use('/__frame', (req, res) => {
      if (req.method !== 'POST') {
        res.end('frame sink up');
        return;
      }
      const i = new URL(req.url, 'http://x').searchParams.get('i') || '0';
      const dir = path.resolve('node_modules/.conway-frames');
      fs.mkdirSync(dir, { recursive: true });
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        let buf = Buffer.concat(chunks);
        const asText = buf.subarray(0, 30).toString();
        if (asText.startsWith('data:image/')) {
          buf = Buffer.from(buf.toString().split(',')[1], 'base64');
        }
        fs.writeFileSync(path.join(dir, i.padStart(4, '0') + '.jpg'), buf);
        res.end('ok');
      });
    });
  },
};

export default defineConfig({
  server: { port: 5173, strictPort: true },
  plugins: [frameSink],
});
