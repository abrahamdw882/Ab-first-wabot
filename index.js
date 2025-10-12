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

async function startBot() {
    console.log('🚀 Starting WhatsApp Bot...');
    isConnecting = true;
    
    try {
        await restoreAuthFiles();

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        sock = makeWASocket({
            logger: pino({ level: 'info' }),
            auth: state,
            printQRInTerminal: false,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: true
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.log('🔄 Generating QR code for web...');
                QRCode.toDataURL(qr, (err, url) => { 
                    if (!err) {
                        latestQR = url;
                        console.log('✅ QR code generated for web');
                    }
                });
            }

            if (connection === 'close') {
                botStatus = 'disconnected';
                isConnecting = false;
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
                            } else console.warn(`⚠️ Invalid plugin structure in ${file}`);
                        } catch (error) {
                            console.error(`❌ Failed to load plugin ${file}:`, error.message);
                        }
                    }
                });
                console.log(`📦 Loaded ${plugins.size} plugins`);
            }
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

    } catch (error) {
        console.error('Bot startup error:', error);
        isConnecting = false;
        setTimeout(() => startBot(), 10000);
    }
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
    
    if (url.pathname === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(latestQR ? `
            <html>
            <body style="background:#111;color:white;text-align:center;padding:50px;">
                <h1>Scan QR Code</h1>
                <img src="${latestQR}" style="max-width:300px;" />
                <p>Status: ${botStatus}</p>
                <p><a href="/pair" style="color:#25D366;">Or use pairing code</a></p>
            </body>
            </html>
        ` : `
            <html>
            <body style="background:#111;color:white;text-align:center;padding:50px;">
                <h1>QR Code Not Ready</h1>
                <p>Status: ${botStatus}</p>
                <p>Please wait for connection or use pairing code...</p>
                <p><a href="/pair" style="color:#25D366;">Use pairing code instead</a></p>
            </body>
            </html>
        `);
    
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
                        input, button { padding: 12px; margin: 10px; width: 80%; border-radius: 5px; border: none; font-size: 16px; }
                        input { background: #222; color: white; text-align: center; }
                        button { background: #25D366; color: white; cursor: pointer; }
                        .code { font-size: 24px; font-weight: bold; color: #25D366; letter-spacing: 3px; margin: 20px 0; }
                        .status { margin: 10px 0; padding: 10px; border-radius: 5px; background: #333; }
                        .waiting { background: #ff9800; color: black; }
                        .ready { background: #4CAF50; }
                        .error { background: #f44336; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>📱 Pair WhatsApp</h1>
                        <div class="status ${botStatus === 'connecting' ? 'waiting' : botStatus === 'connected' ? 'ready' : 'error'}">
                            Status: <strong>${botStatus}</strong>
                        </div>
                        <p>Enter your phone number with country code (without +):</p>
                        <form method="POST">
                            <input type="text" name="phone" placeholder="e.g. 1234567890" required pattern="[0-9]+" title="Numbers only">
                            <button type="submit">Get Pairing Code</button>
                        </form>
                        <p><em>Note: Bot must be in "connecting" state for pairing to work</em></p>
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
                    let phoneNumber = params.get('phone').trim();
                    
                    if (!phoneNumber) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        return res.end('Phone number is required');
                    }

         
                    phoneNumber = phoneNumber.replace(/\D/g, '');

                    if (phoneNumber.length < 8) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        return res.end('Invalid phone number');
                    }

                    console.log(`📱 Requesting pairing code for: ${phoneNumber}, Bot status: ${botStatus}`);
                    if (botStatus !== 'connecting' || !sock) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        return res.end(`
                            <html>
                            <body style="background:#111;color:white;text-align:center;padding:50px;">
                                <h1>❌ Bot Not Ready for Pairing</h1>
                                <p>Current status: <strong>${botStatus}</strong></p>
                                <p>Pairing codes only work when the bot is in "connecting" state.</p>
                                <p>Please wait for the bot to start connecting, then try again.</p>
                                <p><a href="/pair" style="color:#25D366;">Try again</a> | <a href="/qr" style="color:#25D366;">Use QR code</a></p>
                            </body>
                            </html>
                        `);
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

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <head>
                            <title>Pairing Code</title>
                            <style>
                                body { background: #111; color: white; text-align: center; font-family: Arial; padding: 50px; }
                                .container { max-width: 500px; margin: 0 auto; }
                                .code { font-size: 32px; font-weight: bold; color: #25D366; letter-spacing: 4px; margin: 30px 0; padding: 20px; background: #222; border-radius: 10px; }
                                .steps { text-align: left; margin: 20px 0; background: #222; padding: 20px; border-radius: 10px; }
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
                                    <div class="step">5. Wait for connection confirmation</div>
                                </div>
                                
                                <p><em>This code will expire in 10 minutes</em></p>
                                <p><a href="/pair" style="color: #25D366;">← Generate another code</a></p>
                                <p><a href="/qr" style="color: #25D366;">Or scan QR code instead</a></p>
                            </div>
                        </body>
                        </html>
                    `);

                    console.log(`✅ Pairing code generated for ${phoneNumber}: ${pairingCode}`);
                    
                } catch (error) {
                    console.error('❌ Pairing code error:', error);
                    
                    let errorMessage = error.message;
                    if (errorMessage.includes('check phone number')) {
                        errorMessage = 'Please check your phone number and try again. Make sure it includes country code without +.';
                    } else if (errorMessage.includes('not registered')) {
                        errorMessage = 'This phone number is not registered on WhatsApp.';
                    }
                    
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <body style="background:#111;color:white;text-align:center;padding:50px;">
                            <h1>❌ Error Generating Pairing Code</h1>
                            <p>${errorMessage}</p>
                            <p>Current bot status: <strong>${botStatus}</strong></p>
                            <p><a href="/pair" style="color:#25D366;">Try again</a> | <a href="/qr" style="color:#25D366;">Use QR code instead</a></p>
                        </body>
                        </html>
                    `);
                }
            });
        }
    
    } else if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'online', 
            botStatus, 
            prefix: global.BOT_PREFIX, 
            time: new Date().toISOString(),
            hasQR: !!latestQR,
            pairingCodesCount: pairingCodes.size
        }));
    
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
            <body style="background:#111;color:white;text-align:center;padding:50px;">
                <h1>🤖 WhatsApp Bot</h1>
                <p>Status: <strong>${botStatus}</strong></p>
                <div style="margin:20px;">
                    <a href="/qr" style="color:#25D366;margin:10px;padding:10px 20px;border:1px solid #25D366;border-radius:5px;text-decoration:none;display:inline-block;">Scan QR Code</a>
                    <a href="/pair" style="color:#25D366;margin:10px;padding:10px 20px;border:1px solid #25D366;border-radius:5px;text-decoration:none;display:inline-block;">Get Pairing Code</a>
                </div>
                <p><a href="/status" style="color:#666;">API Status</a></p>
            </body>
            </html>
        `);
    }
}).listen(PORT, () => console.log(`HTTP Server running at http://localhost:${PORT}`));
