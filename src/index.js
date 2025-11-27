import express from 'express';
import path, {dirname} from 'path';
import {fileURLToPath} from 'url';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import votesRoutes from './routes/votesRoutes.js';
import authMiddleware from './middleware/authMiddleware.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import categoriesRoutes from './routes/categoriesRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../../goty-bet/dist")));

app.use('/auth', authRoutes);
app.use('/votes', authMiddleware, votesRoutes);
app.use('/leaderboard', authMiddleware, leaderboardRoutes);
app.use('/categories', categoriesRoutes);

app.get(/(.*)/, (req, res) => {
   res.sendFile(path.join(__dirname, "../../goty-bet/dist", "index.html"));
}) 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});