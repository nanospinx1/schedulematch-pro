require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/providers', require('./routes/providers'));
app.use('/api/matching', require('./routes/matching'));
app.use('/api/ai', require('./middleware/auth').authenticateToken, require('./routes/ai'));
app.use('/api/communications', require('./routes/communications'));
app.use('/api/preferences', require('./routes/preferences'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
