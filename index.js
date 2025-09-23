const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');

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
let presenceInterval = null;

const db = new (require('sqlite3').verbose()).Database('./session.db');
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


async function serializeMessage(sock, msg) {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.fromMe ? sock.user.id : (isGroup ? msg.key.participant : from);
    const pushName = msg.pushName || sender.split('@')[0];

    const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg.message?.templateButtonReplyMessage?.selectedId ||
        msg.message?.interactiveResponseMessage?.body?.text ||
        '';

    const type = Object.keys(msg.message || {})[0] || '';
    const isMedia = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage'].includes(type);
    const mediaType = type.replace('Message', '').toLowerCase();
    const mimetype = msg.message?.[type]?.mimetype || null;

   
    const groupMetadata = isGroup
        ? await sock.groupMetadata(from).catch(() => undefined)
        : undefined;

    let quoted;
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (ctxInfo?.quotedMessage) {
        const qMsg = ctxInfo.quotedMessage;
        const qType = Object.keys(qMsg)[0] || '';
        quoted = {
            key: { remoteJid: from, id: ctxInfo.stanzaId, participant: ctxInfo.participant || from },
            message: qMsg,
            type: qType,
            body: qMsg?.conversation || qMsg?.extendedTextMessage?.text || qMsg?.[qType]?.caption || '',
            isMedia: ['imageMessage','videoMessage','documentMessage','audioMessage','stickerMessage'].includes(qType),
            mediaType: qType.replace('Message','').toLowerCase(),
            mimetype: qMsg?.[qType]?.mimetype || null,
            download: async () => await downloadMediaMessage({ message: qMsg, key: { ...msg.key } }, 'buffer', {}, sock)
        };
    }

    return {
        id: msg.key.id,
        from,
        sender,
        pushName,
        isGroup,
        groupMetadata,
        body,
        text: body,
        type,
        mtype: type,
        isMedia,
        mediaType,
        mimetype,
        quoted,
        reply: async (text, options={}) => await sock.sendMessage(from,{text,...options},{quoted:msg}),
        send: async (content, options={}) => await sock.sendMessage(from, typeof content==='string'?{text:content,...options}:content, {quoted:msg}),
        react: async emoji => await sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
        forward: async (jid, force=false) => await sock.sendMessage(jid, { forward: msg, force }),
        download: async () => isMedia ? await downloadMediaMessage(msg,'buffer',{},sock) : (quoted?.isMedia ? await quoted.download() : null)
    };
}


async function startBot() {
    console.log('🚀 Starting WhatsApp Bot...');
    await restoreAuthFiles();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const sock = makeWASocket({
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

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(latestQR ? `<html><body style="background:#111;color:white;text-align:center;"><h1>Scan QR</h1><img src="${latestQR}" /></body></html>` : 'QR not generated yet.');
    } else if (url.pathname === '/watch') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', botStatus, prefix: global.BOT_PREFIX, time: new Date().toISOString() }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot Server is Running. Visit /qr to scan.');
    }
}).listen(PORT, () => console.log(`HTTP Server running at http://localhost:${PORT}`));
