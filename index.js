
const { default: makeWASocket,useMultiFileAuthState,  DisconnectReason, downloadMediaMessage,generateWAMessageFromContent,fetchLatestWaWebVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const sqlite3 = require('sqlite3').verbose();
const { sendButtons, sendInteractiveMessage } = require('gifted-btns');
const serializeMessage = require('./handler.js');
global.generateWAMessageFromContent = generateWAMessageFromContent;

// ===== CONFIGURATION ===== //
global.BOT_PREFIX = '.';
const AUTH_FOLDER = './auth_info_multi';
const PLUGIN_FOLDER = './plugins';
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
const db = new sqlite3.Database('./session.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        filename TEXT PRIMARY KEY,
        content TEXT
    );`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );`);
    db.get("SELECT value FROM settings WHERE key = 'prefix'", (err, row) => {
        if (!err && row) {
            global.BOT_PREFIX = row.value;
            console.log(` Loaded prefix: ${global.BOT_PREFIX}`);
        }
        startBot();
    });
});

/**
 * Restores authentication files from the database.
 */
function restoreAuthFiles() {
    return new Promise((resolve) => {
        db.all("SELECT * FROM sessions", (err, rows) => {
            if (err) return console.error("DB restore error:", err);
            if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER);
            rows.forEach(row => {
                fs.writeFileSync(path.join(AUTH_FOLDER, row.filename), row.content, 'utf8');
            });
            resolve();
        });
    });
}

/**
 * Saves authentication files to the database.
 *
 * This function checks if the AUTH_FOLDER exists and reads all files within it. For each file, it reads the content and attempts to insert or replace the corresponding entry in the sessions table of the database. Errors during the database operation are logged to the console, and any exceptions encountered during the process are also caught and logged.
 */
function saveAuthFilesToDB() {
    try {
        if (!fs.existsSync(AUTH_FOLDER)) return;
        fs.readdirSync(AUTH_FOLDER).forEach(file => {
            const filePath = path.join(AUTH_FOLDER, file);
            const content = fs.readFileSync(filePath, 'utf8');
            db.run("INSERT OR REPLACE INTO sessions (filename, content) VALUES (?, ?)", [file, content], (err) => {
                if (err) console.error(`Failed to save ${file}:`, err);
            });
        });
    } catch (error) {
        console.error('Error saving auth files to DB:', error);
    }
}

async function startBot() {
    console.log(' Starting WhatsApp Bot...');
    isConnecting = true;
    
    try {
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
                    db.run("DELETE FROM sessions", (err) => { if (err) console.error('DB clear failed:', err); });
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
            } else if (connection === 'connecting') {
                botStatus = 'connecting';
                isConnecting = true;
                console.log('Bot is connecting...');
            }
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            saveAuthFilesToDB();
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'online', 
            botStatus, 
            prefix: global.BOT_PREFIX, 
            time: new Date().toISOString(),
            hasQR: !!latestQR,
            latestQR: latestQR,
            pairingCodesCount: pairingCodes.size,
            version: '1.0.0',
            author: 'ABZTech'
        }));
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

