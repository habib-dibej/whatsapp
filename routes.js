// routes.js
const express = require('express');
const sessionManager = require('./sessionManager');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const downloadedMediaCache = new Set();

router.get('/qr/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const session = await sessionManager.createSession(sessionId);
        if (!session.ready && session.qrCodeDataUrl) {
            res.send(session.qrCodeDataUrl);
        } else {
            res.status(404).send('QR Code not available');
        }
    } catch (error) {
        console.error('Error creating session:', error.message);
        res.status(500).json({ error: 'Error creating session', message: error.message });
    }
});

router.get('/ready/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const session = await sessionManager.createSession(sessionId);
        res.json({ ready: session.ready });
    } catch (error) {
        console.error('Error checking session readiness:', error.message);
        res.status(500).json({ error: 'Error checking session readiness', message: error.message });
    }
});

router.get('/chats/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const session = await sessionManager.createSession(sessionId);
        if (!session.ready) {
            return res.status(503).json({ error: 'Client not ready' });
        }

        console.log('Fetching chats...');
        const chats = await session.client.getChats();
        const formattedChats = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user
        }));
        res.json(formattedChats);
    } catch (error) {
        console.error('Error fetching chats:', error.message);
        res.status(500).json({ error: 'Error fetching chats', message: error.message });
    }
});

router.get('/media/:sessionId/:mediaId', (req, res) => {
    const { sessionId, mediaId } = req.params;
    const mediaPath = path.join(__dirname, 'received', sessionId, mediaId);

    if (fs.existsSync(mediaPath)) {
        res.sendFile(mediaPath);
    } else {
        res.status(404).send('Media not found');
    }
});


const processMessages = async (messages, sessionId) => {
    let MediaMessages = [];
    await Promise.all(messages.map(async message => {
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            const mediaDir = path.join(__dirname, 'received', sessionId, message.id.id);

            fs.mkdirSync(mediaDir, { recursive: true });

            const currentTimestamp = Date.now();
            const filename = media.filename || `${currentTimestamp}.${media.mimetype.split('/')[1]}`;
            const mediaPath = path.join(mediaDir, filename);

            fs.writeFileSync(mediaPath, media.data, { encoding: 'base64' });
            MediaMessages.push({ id: message.id.id, path: mediaPath,mimetype: media.mimetype });
        }
    }));

    return MediaMessages;
}

router.get('/chat/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const chatId = req.query.id;
    try {
        const session = await sessionManager.createSession(sessionId);
        console.log('Fetching chat messages for:', chatId);
        const chat = await session.client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 10000 });

        let MediaMessages = await processMessages(messages, sessionId);


        const formattedMessages = messages.map(message => ({
            body: message.body,
            from: message.from,
            fromMe: message.fromMe,
            timestamp: message.timestamp * 1000,
            type: message.type,
            media: message.hasMedia ? {
                url: MediaMessages.find(media => media.id === message.id.id).path || null,
                mimetype: MediaMessages.find(media => media.id === message.id.id).mimetype || null
            } : null

        }));
        res.json({ name: chat.name || chat.id.user, messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching chat messages:', error.message);
        res.status(500).json({ error: 'Error fetching chat messages', message: error.message });
    }
});

router.get('/new-messages/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const chatId = req.query.id;
    const lastTimestamp = req.query.lastTimestamp;
    try {
        const session = await sessionManager.createSession(sessionId);
        const chat = await session.client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 20 });

        const newMessages = messages.filter(message => message.timestamp * 1000 > lastTimestamp);

        const formattedMessages = newMessages.map(message => ({
            body: message.body,
            from: message.from,
            fromMe: message.fromMe,
            timestamp: message.timestamp * 1000,
            mediaUrl: message.hasMedia ? `/media/${sessionId}/${message.id.id}` : null
        }));

        res.json({ messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching new messages:', error.message);
        res.status(500).json({ error: 'Error fetching new messages', message: error.message });
    }
});

router.post('/send/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { id, message } = req.body;
    try {
        const session = await sessionManager.createSession(sessionId);
        console.log('Sending message to chat:', id);
        const chat = await session.client.getChatById(id);
        await chat.sendMessage(message);
        res.status(200).send('Message sent');
    } catch (error) {
        console.error('Error sending message:', error.message);
        res.status(500).json({ error: 'Error sending message', message: error.message });
    }
});

router.post('/logout/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        console.log('Logging out');
        await sessionManager.logoutSession(sessionId);
        res.status(200).send('Logged out');
    } catch (error) {
        console.error('Error logging out:', error.message);
        res.status(500).json({ error: 'Error logging out', message: error.message });
    }
});

router.get('/contacts/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const session = await sessionManager.createSession(sessionId);
        if (!session.ready) {
            return res.status(503).json({ error: 'Client not ready' });
        }

        console.log('Fetching contacts');
        const contacts = await session.client.getContacts();
        const formattedContacts = contacts.map(contact => ({
            id: contact.id._serialized,
            name: contact.name || contact.id.user,
            phone: contact.number || 'N/A'
        }));
        res.json(formattedContacts);
    } catch (error) {
        console.error('Error fetching contacts:', error.message);
        res.status(500).json({ error: 'Error fetching contacts', message: error.message });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

router.post('/upload/:sessionId', upload.single('file'), async (req, res) => {
    const { sessionId } = req.params;
    const { recipientId } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const session = await sessionManager.createSession(sessionId);
        await sessionManager.sendMedia(sessionId, recipientId, file.path);

        res.json({ success: true, message: 'File sent successfully', url: `/uploads/${file.filename}` });
    } catch (error) {
        console.error('Error sending file:', error.message);
        res.status(500).json({ error: 'Error sending file', message: error.message });
    }
});

module.exports = router;
