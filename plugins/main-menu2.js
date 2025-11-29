const { sendInteractiveMessage } = require('gifted-btns');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./session.db');

module.exports = {
    name: 'menu2',
    description: 'Interactive menu with essential commands',
    aliases: ['test', 'menu2'],

    async execute(sock, m) {
        try {
            const prefix = await new Promise((resolve, reject) => {
                db.get("SELECT value FROM settings WHERE key = 'prefix'", (err, row) => {
                    if (err) {
                        console.error('Database error:', err);
                        resolve(global.BOT_PREFIX || '.');
                    } else {
                        resolve(row ? row.value : (global.BOT_PREFIX || '.'));
                    }
                });
            });
            
            await sendInteractiveMessage(sock, m.from, {
                title: '🤖 ABZTech ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ',
                text: `Tap any button below to execute the command instantly:\n\n` +
                      `Current prefix: *${prefix}*\n\n` +
                      '> 「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」',
                footer: 'Instant commands • https://abztech.xyz',
                interactiveButtons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({ 
                            display_text: 'Owner', 
                            id: `${prefix}owner` 
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({ 
                            display_text: 'Alive', 
                            id: `${prefix}alive` 
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({ 
                            display_text: 'Uptime', 
                            id: `${prefix}uptime` 
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({ 
                            display_text: 'Ping', 
                            id: `${prefix}ping` 
                        })
                    }
                ]
            });
        } catch (error) {
            console.error('Menu2 plugin error:', error);
            await m.reply('Failed to load interactive menu.');
        }
    }
};
