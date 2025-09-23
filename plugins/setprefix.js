const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./session.db');

module.exports = {
    name: 'setprefix',
    aliases: ['prefix', 'changeprefix'],
    description: 'Change the command prefix (Owner only)',

    async execute(sock, m, args) {
        if (!global.owners.includes(m.sender)) {
            return m.reply(' You are not allowed to change the prefix.');
        }

        if (!args[0]) {
            return m.reply(`Usage: ${global.BOT_PREFIX}setprefix <newPrefix>`);
        }

        const newPrefix = args[0];
        global.BOT_PREFIX = newPrefix;

        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('prefix', ?)", [newPrefix], (err) => {
            if (err) console.error('failed to save prefix:', err);
        });
        for (const owner of global.owners) {
            try {
                await sock.sendMessage(owner, { text: `Prefix has been changed to: \`${newPrefix}\`` });
            } catch (err) {
                console.error(`Could not notify owner ${owner}:`, err);
            }
        }

        return m.reply(`Prefix changed to: \`${newPrefix}\``);
    }
};
