const { createApp } = require('./src/server/app');

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '0.0.0.0';

const { app } = createApp();

app.listen(PORT, HOST, () => {
  console.log(`tracker-dashboard listening on http://${HOST}:${PORT}`);
});
