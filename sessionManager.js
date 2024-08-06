const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

class SessionManager {
    constructor() {
        this.sessions = new Map();
    }

    async createSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            const client = new Client({
                authStrategy: new LocalAuth({ clientId: sessionId })
            });

            client.on('qr', (qr) => {
                console.log('QR RECEIVED', qr);
                const session = this.sessions.get(sessionId);
                session.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}`;
            });

            client.on('ready', () => {
                console.log('Client is ready!');
                const session = this.sessions.get(sessionId);
                session.ready = true;
            });

            client.on('authenticated', () => {
                console.log(`Session ${sessionId} authenticated`);
            });

            client.on('auth_failure', (msg) => {
                console.error(`Authentication failure for session ${sessionId}:`, msg);
                this.sessions.delete(sessionId);
            });

            client.on('disconnected', (reason) => {
                console.log(`Session ${sessionId} disconnected:`, reason);
                this.sessions.delete(sessionId);
            });

            client.on('message', async (msg) => {
                if (msg.hasMedia) {
                    const media = await msg.downloadMedia();
                    console.log('Media received:', media);
                }
            });

            client.initialize();

            this.sessions.set(sessionId, {
                client,
                qrCodeDataUrl: null,
                ready: false
            });
        } else {
            return this.sessions.get(sessionId);
        }

        return this.sessions.get(sessionId);
    }

    async logoutSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.client.logout();
            this.sessions.delete(sessionId);
        }
    }


    async sendMedia(sessionId, chatId, mediaPath) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        if (!session.ready) throw new Error('Client not ready');
        console.log('Sending media to:', chatId);
        console.log('Media path:', mediaPath);
        
        const media = MessageMedia.fromFilePath(mediaPath);
        await session.client.sendMessage(chatId, media);
    }
}

module.exports = new SessionManager();
