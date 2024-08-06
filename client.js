const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs'); // File system module
const mime = require('mime-types'); // To handle media types

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

let qrCodeDataUrl = '';
let ready = false;

// WebSocket setup (to be used in index.js)
let wss;

function setWebSocketServer(server) {
    wss = server;
}

// Broadcast function for WebSocket
function broadcastMessage(data) {
    if (wss) {
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(JSON.stringify(data));
            }
        });
    }
}

client.on('qr', async (qr) => {
    qrCodeDataUrl = await qrcode.toDataURL(qr);
    console.log('QR Code generated');
});

client.on('ready', () => {
    ready = true;
    console.log('Client is ready!');
    qrCodeDataUrl = '';  
});

client.on('authenticated', () => {
    ready = true;
    console.log('Client is authenticated!');
    qrCodeDataUrl = '';  
});

client.on('auth_failure', (message) => {
    ready = false;
    console.error('Authentication failure:', message);
    qrCodeDataUrl = ''; 
});

client.on('disconnected', (reason) => {
    ready = false;
    console.log('Client was logged out:', reason);
    qrCodeDataUrl = '';  
});

// Listen for incoming messages and broadcast them via WebSocket
client.on('message', async (message) => {
    const chatId = message.fromMe ? message.to : message.from;
    
    // Handle media messages
    let mediaUrl = null;
    if (message.hasMedia) {
        const media = await message.downloadMedia();
        const extension = mime.extension(media.mimetype);
        const fileName = `${Date.now()}.${extension}`;
        fs.writeFileSync(`./public/media/${fileName}`, media.data, { encoding: 'base64' });
        mediaUrl = `/media/${fileName}`;
    }

    const messageData = {
        type: 'message',
        chatId,
        message: {
            body: message.body,
            mediaUrl, // Add media URL if exists
            fromMe: message.fromMe,
            timestamp: message.timestamp * 1000 // Convert seconds to milliseconds
        }
    };
    broadcastMessage(messageData);
});

client.initialize();

module.exports = { client, qrCodeDataUrl, ready, setWebSocketServer };
