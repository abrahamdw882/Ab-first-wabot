const { generateWAMessageFromContent } = require('@whiskeysockets/baileys')
const db = new (require('sqlite3').verbose()).Database('./session.db');

global.db = db
// ===== CONFIGURATION ===== //
global.BOT_PREFIX = '.';  
global.AUTH_FOLDER = './auth_info_multi';
global.PLUGIN_FOLDER = './plugins';
global.PORT = 3000 || 8000;

global.owners = [
    '25770239992037@lid',
    '233533763772@s.whatsapp.net'
]; 

global.latestQR = '';
global.botStatus = 'disconnected';
global.presenceInterval = null;
global.generateWAMessageFromContent = generateWAMessageFromContent

// ========================= //
