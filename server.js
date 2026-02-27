const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let lastLocation = { lat: 0, lng: 0, spd: 0, sats: 0, time: "No data yet" };

// 1. Endpoint for ESP32 to send data
app.post('/update-location', (req, res) => {
    console.log("--- New Data Received ---", req.body);
    if (req.body.lat && req.body.lng) {
        lastLocation = { ...req.body, time: new Date().toLocaleTimeString() };
    }
    res.status(200).send("OK");
});

// 2. NEW: Endpoint for the Dashboard to fetch data
app.get('/api/location', (req, res) => {
    res.json(lastLocation);
});

// 3. Serve the Dashboard HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
