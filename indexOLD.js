const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const port = 3000;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

let qrCodeDataUrl = '';
let ready = false;

client.on('qr', async (qr) => {
    qrCodeDataUrl = await qrcode.toDataURL(qr);
    console.log('QR Code generated');
});

client.on('ready', () => {
    ready = true;
    console.log('Client is ready!');
    qrCodeDataUrl = '';  // Clear QR code once authenticated
});

client.on('authenticated', () => {
    ready = true;
    console.log('Client is authenticated!');
    qrCodeDataUrl = '';  // Clear QR code once authenticated
});

client.on('auth_failure', (message) => {
    ready = false;
    console.error('Authentication failure:', message);
    qrCodeDataUrl = '';  // Reset QR code on failure
});

client.on('disconnected', (reason) => {
    ready = false;
    console.log('Client was logged out:', reason);
    qrCodeDataUrl = '';  // Reset QR code when disconnected
});

client.initialize();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/qr', (req, res) => {
    if (!ready && qrCodeDataUrl) {
        res.send(qrCodeDataUrl);
    } else {
        res.status(404).send('QR Code not available');
    }
});

app.get('/ready', (req, res) => {
    res.json({ ready });
});

app.get('/chats', async (req, res) => {
    try {
        if (!ready) {
            console.log('Client not ready');
            return res.status(503).json({ error: 'Client not ready' });
        }

        console.log('Fetching chats');
        const chats = await client.getChats();
        const formattedChats = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user
        }));
        res.json(formattedChats);
    } catch (error) {
        console.error('Error fetching chats:', error.message);
        // Capture and log the error stack for more detail
        console.error(error.stack);
        res.status(500).json({ error: 'Error fetching chats', message: error.message });
    }
});

app.get('/chat', async (req, res) => {
    const chatId = req.query.id;
    try {
        console.log('Fetching chat messages for:', chatId);
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 20 });
        const formattedMessages = messages.map(message => ({
            body: message.body,
            from: message.from,
            fromMe: message.fromMe,
            timestamp: message.timestamp * 1000  // Convert seconds to milliseconds
        }));
        res.json({ name: chat.name || chat.id.user, messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching chat messages:', error.message);
        res.status(500).json({ error: 'Error fetching chat messages', message: error.message });
    }
});

app.post('/send', async (req, res) => {
    const { id, message } = req.body;
    try {
        console.log('Sending message to chat:', id);
        const chat = await client.getChatById(id);
        await chat.sendMessage(message);
        res.status(200).send('Message sent');
    } catch (error) {
        console.error('Error sending message:', error.message);
        res.status(500).json({ error: 'Error sending message', message: error.message });
    }
});

app.post('/logout', async (req, res) => {
    try {
        console.log('Logging out');
        await client.logout();
        ready = false;  // Reset ready state
        qrCodeDataUrl = '';  // Clear stored QR code data

        // Initialize the client again to generate a new QR code
        client.initialize();
        res.status(200).send('Logged out');
    } catch (error) {
        console.error('Error logging out:', error.message);
        res.status(500).json({ error: 'Error logging out', message: error.message });
    }
});

app.get('/contacts', async (req, res) => {
    try {
        if (!ready) {
            console.log('Client not ready');
            return res.status(503).json({ error: 'Client not ready' });
        }

        console.log('Fetching contacts');
        const contacts = await client.getContacts();
        const formattedContacts = contacts.map(contact => ({
            id: contact.id._serialized,
            name: contact.name || contact.id.user,
            phone: contact.number || 'N/A' // Access the correct property for phone
        }));
        res.json(formattedContacts);
    } catch (error) {
        console.error('Error fetching contacts:', error.message);
        res.status(500).json({ error: 'Error fetching contacts', message: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
