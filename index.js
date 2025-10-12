const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const sqlite3 = require('sqlite3').verbose();

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

let sock; 

async function startBot() {
    console.log('🚀 Starting WhatsApp Bot...');
    await restoreAuthFiles();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    sock = makeWASocket({
        logger: pino({ level: 'info' }),
        auth: state,
        printQRInTerminal: true,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
        syncFullHistory: true
    });

    setInterval(() => console.log(`[${new Date().toLocaleString()}] Bot is still running...`), 5*60*1000);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) QRCode.toDataURL(qr, (err, url) => { if (!err) latestQR = url; });

        if (connection === 'close') {
            botStatus = 'disconnected';
            if (presenceInterval) clearInterval(presenceInterval);

            const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0;

            if (statusCode !== DisconnectReason.loggedOut) {
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
            console.log('Bot is connected ✅');

            presenceInterval = setInterval(() => {
                if (sock?.ws?.readyState === 1) sock.sendPresenceUpdate('available');
            }, 10000);

            try { await sock.sendMessage(sock.user.id, { text: `Bot linked successfully!\nCurrent prefix: ${global.BOT_PREFIX}` }); }
            catch (err) { console.error('Could not send message:', err); }
        }
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        saveAuthFilesToDB();
    });
    const plugins = new Map();
    const pluginPath = path.join(__dirname, PLUGIN_FOLDER);
    try {
        fs.readdirSync(pluginPath).forEach(file => {
            if (file.endsWith('.js')) {
                try {
                    const plugin = require(path.join(pluginPath, file));
                    if (plugin.name && typeof plugin.execute === 'function') {
                        plugins.set(plugin.name.toLowerCase(), plugin);
                        if (Array.isArray(plugin.aliases)) plugin.aliases.forEach(alias => plugins.set(alias.toLowerCase(), plugin));
                        console.log(`✅ Loaded plugin: ${plugin.name}`);
                    } else console.warn(`⚠️ Invalid plugin structure in ${file}`);
                } catch (error) {
                    console.error(`❌ Failed to load plugin ${file}:`, error.message);
                }
            }
        });
        console.log(`📦 Loaded ${plugins.size} plugins`);
    } catch (error) { console.error('❌ Error loading plugins:', error); }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const rawMsg = messages[0];
        if (!rawMsg.message) return;

        const m = await serializeMessage(sock, rawMsg);

        if (m.body.startsWith(global.BOT_PREFIX)) {
            const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
            const commandName = args.shift().toLowerCase();
            const plugin = plugins.get(commandName);
            if (plugin) {
                try { await plugin.execute(sock, m, args); }
                catch (err) { console.error(`❌ Plugin error (${commandName}):`, err); await m.reply('Error running command.'); }
            }
        }
        for (const plugin of plugins.values()) {
            if (typeof plugin.onMessage === 'function') {
                try { await plugin.onMessage(sock, m); }
                catch (err) { console.error(`❌ onMessage error (${plugin.name}):`, err); }
            }
        }
    });
}
http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    if (url.pathname === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(latestQR ? `<html><body style="background:#111;color:white;text-align:center;"><h1>Scan QR</h1><img src="${latestQR}" /></body></html>` : 'QR not generated yet.');
    
    } else if (url.pathname === '/pair') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <html>
                <head>
                    <title>Pair with WhatsApp</title>
                    <style>
                        body { background: #111; color: white; text-align: center; font-family: Arial; padding: 50px; }
                        .container { max-width: 400px; margin: 0 auto; }
                        input, button { padding: 10px; margin: 10px; width: 80%; border-radius: 5px; border: none; }
                        input { background: #222; color: white; }
                        button { background: #25D366; color: white; cursor: pointer; }
                        .code { font-size: 24px; font-weight: bold; color: #25D366; letter-spacing: 3px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>📱 Pair WhatsApp</h1>
                        <p>Enter your phone number with country code:</p>
                        <form method="POST">
                            <input type="text" name="phone" placeholder="e.g. 1234567890" required>
                            <button type="submit">Get Pairing Code</button>
                        </form>
                        <p><a href="/qr" style="color: #25D366;">Or scan QR code instead</a></p>
                    </div>
                </body>
                </html>
            `);
        } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const params = new URLSearchParams(body);
                    const phoneNumber = params.get('phone').trim();
                    
                    if (!phoneNumber) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        return res.end('Phone number is required');
                    }

                    if (!sock || botStatus !== 'connected') {
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        return res.end('Bot is not connected. Please try again later.');
                    }
                    const pairingCode = await sock.requestPairingCode(phoneNumber);
                    pairingCodes.set(phoneNumber, pairingCode);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <head>
                            <title>Pairing Code</title>
                            <style>
                                body { background: #111; color: white; text-align: center; font-family: Arial; padding: 50px; }
                                .container { max-width: 500px; margin: 0 auto; }
                                .code { font-size: 32px; font-weight: bold; color: #25D366; letter-spacing: 4px; margin: 30px 0; padding: 20px; background: #222; border-radius: 10px; }
                                .steps { text-align: left; margin: 20px 0; }
                                .step { margin: 10px 0; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>✅ Pairing Code Generated</h1>
                                <p>For phone number: <strong>${phoneNumber}</strong></p>
                                
                                <div class="code">${pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode}</div>
                                
                                <div class="steps">
                                    <h3>How to use:</h3>
                                    <div class="step">1. Open WhatsApp on your phone</div>
                                    <div class="step">2. Go to Settings → Linked Devices</div>
                                    <div class="step">3. Tap "Link a Device"</div>
                                    <div class="step">4. Enter this code: <strong>${pairingCode}</strong></div>
                                </div>
                                
                                <p><a href="/pair" style="color: #25D366;">← Generate another code</a></p>
                                <p><a href="/qr" style="color: #25D366;">Or scan QR code instead</a></p>
                            </div>
                        </body>
                        </html>
                    `);

                    console.log(`📱 Pairing code generated for ${phoneNumber}: ${pairingCode}`);
                    
                } catch (error) {
                    console.error('Pairing code error:', error);
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <body style="background:#111;color:white;text-align:center;padding:50px;">
                            <h1>Error</h1>
                            <p>Failed to generate pairing code: ${error.message}</p>
                            <p><a href="/pair" style="color:#25D366;">Try again</a></p>
                        </body>
                        </html>
                    `);
                }
            });
        }
    
    } else if (url.pathname === '/watch') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'online', 
            botStatus, 
            prefix: global.BOT_PREFIX, 
            time: new Date().toISOString(),
            pairingCodes: Array.from(pairingCodes.entries())
        }));
    
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
            <body style="background:#111;color:white;text-align:center;padding:50px;">
                <h1>🤖 WhatsApp Bot</h1>
                <p>Status: <strong>${botStatus}</strong></p>
                <div style="margin:20px;">
                    <a href="/qr" style="color:#25D366;margin:10px;display:inline-block;">Scan QR Code</a>
                    <a href="/pair" style="color:#25D366;margin:10px;display:inline-block;">Get Pairing Code</a>
                </div>
            </body>
            </html>
        `);
    }
}).listen(PORT, () => console.log(`HTTP Server running at http://localhost:${PORT}`));
