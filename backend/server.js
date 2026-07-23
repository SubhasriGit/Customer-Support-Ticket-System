require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const ticketsRouter = require('./routes/tickets');
const analyticsRouter = require('./routes/analytics');
const suggestionsRouter = require('./routes/suggestions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/tickets', ticketsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/tickets', suggestionsRouter);

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
