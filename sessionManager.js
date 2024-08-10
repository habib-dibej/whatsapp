const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');



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
                console.log(`QR RECEIVED for session ${sessionId}`);
                const session = this.sessions.get(sessionId);
                session.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}`;
            });

            client.on('ready', () => {
                console.log(`Client for session ${sessionId} is ready!`);
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
                    console.log(`Media received for session ${sessionId}:`, media.filename || media.mimetype);
                    const mediaPath = `received/${media.filename || 'media'}.${media.mimetype.split('/')[1]}`;
                    fs.writeFileSync(mediaPath, media.data, { encoding: 'base64' });
                    console.log(`Media saved at ${mediaPath}`);
                }
            });

            client.initialize();

            this.sessions.set(sessionId, {
                client,
                qrCodeDataUrl: null,
                ready: false
            });
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
    async convertAudio(inputPath) {
        const outputPath = inputPath.replace('.webm', '.mp3');
        return new Promise((resolve, reject) => {
            exec(`ffmpeg -i ${inputPath} -acodec libmp3lame ${outputPath}`, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error converting audio:', stderr);
                    reject(error);
                } else {
                    console.log('Audio converted to MP3:', outputPath);
                    resolve(outputPath);
                }
            });
        });
    }

    async sendMedia(sessionId, chatId, mediaPath) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        if (!session.ready) throw new Error('Client not ready');

        try {
            if (!fs.existsSync(mediaPath)) {
                throw new Error(`File does not exist at path: ${mediaPath}`);
            }

            let convertedMediaPath = mediaPath;
            if (mediaPath.endsWith('.webm')) {
                convertedMediaPath = await this.convertAudio(mediaPath);
            }

            const media = MessageMedia.fromFilePath(convertedMediaPath);

            await session.client.sendMessage(chatId, media);
            console.log(`Media sent to chat: ${chatId}`);
        } catch (error) {
            console.error('Error sending media:', error);
            throw error; 
        }
    }
}

module.exports = new SessionManager();
