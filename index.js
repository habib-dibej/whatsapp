const express = require('express');
const path = require('path');
const routes = require('./routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', routes);
app.use('/uploads', express.static('uploads'));
app.use('/media', express.static(path.join(__dirname, 'received')));

app.get('/get-ip', (req, res) => {
    fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(data => {
            const sanitizedIp = data.ip.replace(/\./g, '-'); // Replace dots with hyphens
            console.log('Your Public IP Address:', sanitizedIp);
            res.json({ ip: sanitizedIp });
        })
        .catch(error => {
            console.error('Error fetching IP:', error);
            res.status(500).json({ error: 'Error fetching IP', message: error.message });
        });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
