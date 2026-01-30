const { default: makeWASocket,useMultiFileAuthState,  DisconnectReason, downloadMediaMessage,generateWAMessageFromContent,fetchLatestWaWebVersion,proto
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const { sendButtons, sendInteractiveMessage } = require('gifted-btns');
const serializeMessage = require('./handler.js');
global.generateWAMessageFromContent = generateWAMessageFromContent;
global.proto = proto;

// ===== CONFIGURATION ===== //
global.BOT_PREFIX = '.';
const AUTH_FOLDER = './auth_info_multi';
const PLUGIN_FOLDER = './plugins';
const SESSION_FILE = './session.json';
const PORT = process.env.PORT || 3000;

const owners = [
    '25770239992037@lid',
    '233533763772@s.whatsapp.net'
];
global.owners = owners;
// ========================= //

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;

/**
 * Load session data from session.json
 */
function loadSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = fs.readFileSync(SESSION_FILE, 'utf8');
            const session = JSON.parse(data);
            
            if (session.prefix) {
                global.BOT_PREFIX = session.prefix;
                console.log(` Loaded prefix: ${global.BOT_PREFIX}`);
            }
            
            return session;
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
    return {};
}

/**
 * Save session data to session.json
 */
function saveSession(data = {}) {
    try {
        // Merge with existing data
        const existing = loadSession();
        const sessionData = { ...existing, ...data, updatedAt: new Date().toISOString() };
        
        // Save prefix if it exists in global
        if (global.BOT_PREFIX) {
            sessionData.prefix = global.BOT_PREFIX;
        }
        
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
    } catch (error) {
        console.error('Error saving session:', error);
    }
}

/**
 * Restores authentication files from the session.json backup.
 */
function restoreAuthFiles() {
    return new Promise((resolve) => {
        try {
            const session = loadSession();
            
            if (!session.authFiles || !fs.existsSync(AUTH_FOLDER)) {
                fs.mkdirSync(AUTH_FOLDER, { recursive: true });
                return resolve();
            }
            
            // Restore auth files from session backup
            Object.entries(session.authFiles).forEach(([filename, content]) => {
                const filePath = path.join(AUTH_FOLDER, filename);
                fs.writeFileSync(filePath, content, 'utf8');
            });
            
            console.log(` Restored auth files from backup`);
            resolve();
        } catch (error) {
            console.error('Error restoring auth files:', error);
            resolve();
        }
    });
}

/**
 * Saves authentication files to session.json backup.
 */
function saveAuthFilesToBackup() {
    try {
        if (!fs.existsSync(AUTH_FOLDER)) return;
        
        const authFiles = {};
        const files = fs.readdirSync(AUTH_FOLDER);
        
        files.forEach(file => {
            const filePath = path.join(AUTH_FOLDER, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                authFiles[file] = content;
            } catch (error) {
                console.error(`Failed to read ${file}:`, error);
            }
        });
        
        const session = loadSession();
        session.authFiles = authFiles;
        saveSession(session);
    } catch (error) {
        console.error('Error saving auth files to backup:', error);
    }
}

/**
 * Clean up old session data
 */
function cleanupSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const session = loadSession();
            // Keep only essential data
            const essentialData = {
                prefix: session.prefix || global.BOT_PREFIX,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(SESSION_FILE, JSON.stringify(essentialData, null, 2));
        }
    } catch (error) {
        console.error('Error cleaning up session:', error);
    }
}

async function startBot() {
    console.log(' Starting WhatsApp Bot...');
    isConnecting = true;
    
    try {
        // Load session settings first
        loadSession();
        
        await restoreAuthFiles();
        const { version, isLatest } = await fetchLatestWaWebVersion();
        console.log(` Using WA v${version.join(".")}, isLatest: ${isLatest}`);

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        sock = makeWASocket({
            version, 
            logger: pino({ level: 'info' }),
            auth: state,
            printQRInTerminal: false,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: false
        });
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('Generating QR code for web...');
                QRCode.toDataURL(qr, (err, url) => { 
                    if (!err) {
                        latestQR = url;
                        console.log('QR code generated for web');
                    }
                });
            }

            if (connection === 'close') {
                botStatus = 'disconnected';
                isConnecting = false;
                if (presenceInterval) clearInterval(presenceInterval);

                const statusCode = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output.statusCode
                    : 0;

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(
                    "Connection closed due to",
                    lastDisconnect?.error?.message,
                    ", reconnecting:",
                    shouldReconnect
                );

                if (shouldReconnect) {
                    console.log('Reconnecting in 10 seconds...');
                    setTimeout(() => startBot(), 10000);
                } else {
                    console.log('Logged out. Cleaning up...');
                    if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                    cleanupSession();
                    setTimeout(() => startBot(), 3000);
                }
            } else if (connection === 'open') {
                botStatus = 'connected';
                isConnecting = false;
                console.log('Bot is connected ✅');

                presenceInterval = setInterval(() => {
                    if (sock?.ws?.readyState === 1) sock.sendPresenceUpdate('available');
                }, 10000);

                try { 
                    await sock.sendMessage(sock.user.id, { 
                        text: `Bot linked successfully!\nCurrent prefix: ${global.BOT_PREFIX}` 
                    }); 
                } catch (err) { 
                    console.error('Could not send message:', err); 
                }
                
                // Save session data on successful connection
                saveSession({
                    user: sock.user?.id,
                    connectedAt: new Date().toISOString()
                });
            } else if (connection === 'connecting') {
                botStatus = 'connecting';
                isConnecting = true;
                console.log('Bot is connecting...');
            }
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            saveAuthFilesToBackup();
        });

        const plugins = new Map();
        const pluginPath = path.join(__dirname, PLUGIN_FOLDER);
        try {
            if (fs.existsSync(pluginPath)) {
                fs.readdirSync(pluginPath).forEach(file => {
                    if (file.endsWith('.js')) {
                        try {
                            const plugin = require(path.join(pluginPath, file));
                            if (plugin.name && typeof plugin.execute === 'function') {
                                plugins.set(plugin.name.toLowerCase(), plugin);
                                if (Array.isArray(plugin.aliases)) plugin.aliases.forEach(alias => plugins.set(alias.toLowerCase(), plugin));
                                console.log(`✅ Loaded plugin: ${plugin.name}`);
                            } else console.warn(`Invalid plugin structure in ${file}`);
                        } catch (error) {
                            console.error(`Failed to load plugin ${file}:`, error.message);
                        }
                    }
                });
                console.log(`📦 Loaded ${plugins.size} plugins`);
            }
        } catch (error) { console.error('Error loading plugins:', error); }

       
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            for (const rawMsg of messages) {
                if (rawMsg.key.remoteJid === 'status@broadcast' && rawMsg.key.participant) {
                    try {
                        console.log(`📱 Status detected from: ${rawMsg.key.participant}`);
                        await sock.readMessages([rawMsg.key]);
                        console.log('✅ Status marked as viewed');
                        continue;
                    } catch (err) {
                        console.log('❌ Status viewer error:', err.message);
                    }
                }
            }

            const rawMsg = messages[0];
            if (!rawMsg.message) return;

            const m = await serializeMessage(sock, rawMsg);

            if (m.body.startsWith(global.BOT_PREFIX)) {
                const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
                const commandName = args.shift().toLowerCase();
                const plugin = plugins.get(commandName);
                if (plugin) {
                    try { await plugin.execute(sock, m, args); }
                    catch (err) { console.error(`Plugin error (${commandName}):`, err); await m.reply('Error running command.'); }
                }
            }
            for (const plugin of plugins.values()) {
                if (typeof plugin.onMessage === 'function') {
                    try { await plugin.onMessage(sock, m); }
                    catch (err) { console.error(`onMessage error (${plugin.name}):`, err); }
                }
            }
        });

    } catch (error) {
        console.error('Bot startup error:', error);
        isConnecting = false;
        setTimeout(() => startBot(), 10000);
    }
}

function serveStaticFile(urlPath, res) {
    const staticPath = path.join(__dirname, 'public');
    const filePath = path.join(staticPath, urlPath);
    if (!filePath.startsWith(staticPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.json': 'application/json',
        '.html': 'text/html'
    };

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error serving static file:', err);
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        res.writeHead(200, { 
            'Content-Type': contentTypes[ext] || 'text/plain',
            'Cache-Control': 'public, max-age=3600'
        });
        res.end(data);
    });
}

http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    if (url.pathname === '/style.css' || url.pathname === '/script.js') {
        serveStaticFile(url.pathname, res);
        return;
    }

    if (url.pathname === '/' || url.pathname === '/qr' || url.pathname === '/pair') {
        let page = 'index.html';
        if (url.pathname === '/qr') page = 'qr.html';
        if (url.pathname === '/pair') page = 'pair.html';
        serveStaticFile(page, res);
        return;
    }

    if (url.pathname === '/api/status') {
        const session = loadSession();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'online', 
            botStatus, 
            prefix: global.BOT_PREFIX, 
            time: new Date().toISOString(),
            hasQR: !!latestQR,
            latestQR: latestQR,
            pairingCodesCount: pairingCodes.size,
            sessionData: {
                hasSession: fs.existsSync(SESSION_FILE),
                updatedAt: session.updatedAt,
                authFilesCount: session.authFiles ? Object.keys(session.authFiles).length : 0
            },
            version: '1.0.0',
            author: 'ABZTech'
        }));
        return;
    }

    if (url.pathname === '/api/session' && req.method === 'GET') {
        const session = loadSession();
        // Don't expose auth file contents via API for security
        if (session.authFiles) {
            session.authFiles = { count: Object.keys(session.authFiles).length };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session));
        return;
    }

    if (url.pathname === '/api/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const params = new URLSearchParams(body);
                let phoneNumber = params.get('phone').trim();
                
                if (!phoneNumber) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Phone number is required' }));
                    return;
                }

                phoneNumber = phoneNumber.replace(/\D/g, '');
                if (phoneNumber.length < 8) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid phone number' }));
                    return;
                }

                console.log(`📱 Requesting pairing code for: ${phoneNumber}, Bot status: ${botStatus}`);
                
                if (botStatus !== 'connecting' || !sock) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: `Bot not ready for pairing. Current status: ${botStatus}. Please wait for "connecting" state.` 
                    }));
                    return;
                }

                const pairingCode = await sock.requestPairingCode(phoneNumber);
                
                pairingCodes.set(phoneNumber, {
                    code: pairingCode,
                    timestamp: Date.now()
                });
                
                // Clean up old pairing codes
                const now = Date.now();
                for (let [number, data] of pairingCodes.entries()) {
                    if (now - data.timestamp > 10 * 60 * 1000) {
                        pairingCodes.delete(number);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true,
                    phoneNumber: phoneNumber,
                    pairingCode: pairingCode
                }));

                console.log(`✅ Pairing code generated for ${phoneNumber}: ${pairingCode}`);
                
            } catch (error) {
                console.error(' Pairing code error:', error);
                
                let errorMessage = error.message;
                if (errorMessage.includes('check phone number')) {
                    errorMessage = 'Please check your phone number and try again. Make sure it includes country code without +.';
                } else if (errorMessage.includes('not registered')) {
                    errorMessage = 'This phone number is not registered on WhatsApp.';
                }
                
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
}).listen(PORT, () => {
    console.log(`Bot running at http://localhost:${PORT}`);
    console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
    console.log(`Session file: ${SESSION_FILE}`);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('rejectionHandled', (promise) => {
    console.warn('Rejection handled later:', promise);
});

process.on('multipleResolves', (type, promise, reason) => {
    console.warn('Multiple Resolves:', type, reason);
});

// Save session on exit
process.on('SIGINT', () => {
    saveSession({ lastExit: new Date().toISOString() });
    process.exit(0);
});

process.on('SIGTERM', () => {
    saveSession({ lastExit: new Date().toISOString() });
    process.exit(0);
});
