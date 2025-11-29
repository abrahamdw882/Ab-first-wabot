const { sendInteractiveMessage } = require('gifted-btns');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./session.db');

module.exports = {
    name: 'copy',
    description: 'Interactive menu with copy buttons and actions',
    aliases: ['copy', 'cop'],

    async execute(sock, m) {
        try {
            await m.reply('Loading action menu...');
            
            const prefix = await new Promise((resolve) => {
                db.get("SELECT value FROM settings WHERE key = 'prefix'", (err, row) => {
                    if (err) {
                        resolve(global.BOT_PREFIX || '.');
                    } else {
                        resolve(row ? row.value : (global.BOT_PREFIX || '.'));
                    }
                });
            });
            
            await sendInteractiveMessage(sock, m.from, {
                title: 'ABZTech Action Menu',
                text: `Choose an action below:\n\nCurrent prefix: *${prefix}*\n\n> 「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」`,
                footer: 'Copy & Action commands • https://abztech.xyz',
                interactiveButtons: [
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Email',
                            copy_code: 'support@abztech.xyz'
                        })
                    },
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Website',
                            copy_code: 'https://abztech.xyz'
                        })
                    },
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Number',
                            copy_code: '+233533763772'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Visit Site',
                            url: 'https://abztech.xyz'
                        })
                    }
                ]
            });
        } catch (error) {
            console.error('Menu3 plugin error:', error);
            await m.reply('Failed to load action menu.');
        }
    }
};
