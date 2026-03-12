import express from 'express';
import path, {dirname} from 'path';
import {fileURLToPath} from 'url';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import votesRoutes from './routes/votesRoutes.js';
import authMiddleware from './middleware/authMiddleware.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import categoriesRoutes from './routes/categoriesRoutes.js';
import eventRoutes from './routes/eventRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../../goty-bet/dist")));

// Public routes
app.use('/auth', authRoutes);
app.use('/categories', categoriesRoutes);
app.use('/event', eventRoutes);

// Authenticated routes
app.use('/votes', authMiddleware, votesRoutes);
app.use('/leaderboard', authMiddleware, leaderboardRoutes);

app.get("/", (req, res) => {
  res.send("API is running 🚀");
}); 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});