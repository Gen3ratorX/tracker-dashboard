const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let lastLocation = { lat: 0, lng: 0, spd: 0, sats: 0, time: "No data yet" };

// Route to receive data
app.post('/update-location', (req, res) => {
    console.log("--- New Data Received ---", req.body);
    if (req.body.lat && req.body.lng) {
        lastLocation = { ...req.body, time: new Date().toLocaleString() };
    }
    res.status(200).send("OK");
});

// Route to view data in browser
app.get('/', (req, res) => {
    res.send(`<h1>Tracker Dashboard</h1><p>Last Update: ${lastLocation.time}</p>`);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log(`⏳ Waiting for GPS data... (Press Ctrl+C to stop)`);
});

// --- NEW: Error Catchers to see why it stops ---
server.on('error', (error) => {
    console.error('❌ Server Error:', error.message);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Fatal Crash:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
});