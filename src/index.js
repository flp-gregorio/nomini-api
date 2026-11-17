import express from 'express';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import votesRoutes from './routes/votesRoutes.js';
import authMiddleware from './middleware/authMiddleware.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import categoriesRoutes from './routes/categoriesRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import artworkRoutes from './routes/artworkRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache CORS preflights for 24h to prevent redundant OPTIONS roundtrips on auth endpoints
app.use(cors({ maxAge: 86400 }));
app.use(express.json());

// Lightweight zero-dependency gzip compression for JSON/text responses >= 1 KB
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip') || req.method === 'HEAD') {
    return next();
  }

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (
      res.headersSent ||
      res.getHeader('Content-Encoding') ||
      body === undefined ||
      body === null
    ) {
      return originalSend(body);
    }

    const contentType = String(res.getHeader('Content-Type') || '');
    const isCompressible =
      !contentType ||
      contentType.includes('json') ||
      contentType.includes('text/') ||
      contentType.includes('javascript') ||
      contentType.includes('svg');

    if (!isCompressible) {
      return originalSend(body);
    }

    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    if (buf.length < 1024) {
      return originalSend(body);
    }

    const compressed = zlib.gzipSync(buf);
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', compressed.length);
    return originalSend(compressed);
  };

  next();
});

// Static asset caching when serving built frontend assets
const staticCacheOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      // Vite hashed bundles are immutable
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
};
app.use(
  express.static(path.join(__dirname, '../../nomini-app/dist'), staticCacheOptions)
);
app.use(
  express.static(path.join(__dirname, '../../goty-bet/dist'), staticCacheOptions)
);

// Public routes
app.use('/auth', authRoutes);
app.use('/categories', categoriesRoutes);
app.use('/event', eventRoutes);

// Authenticated routes
app.use('/votes', authMiddleware, votesRoutes);
app.use('/leaderboard', authMiddleware, leaderboardRoutes);
app.use('/artwork', artworkRoutes);

app.get('/', (req, res) => {
  res.send('API is running 🚀');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
