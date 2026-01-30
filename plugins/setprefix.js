const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'setprefix',
    aliases: ['prefix', 'changeprefix'],
    description: 'Change the command prefix (Owner only)',

    async execute(sock, m, args) {
        if (!global.owners.includes(m.sender)) {
            return m.reply(' You are not allowed to change the prefix.');
        }

        if (!args[0]) {
            return m.reply(`Current prefix: \`${global.BOT_PREFIX}\`\nUsage: ${global.BOT_PREFIX}setprefix <newPrefix>`);
        }

        const newPrefix = args[0];
        global.BOT_PREFIX = newPrefix;

        
        try {
            const sessionFile = path.join(__dirname, '../session.json');
            let sessionData = {};
            
            if (fs.existsSync(sessionFile)) {
                const data = fs.readFileSync(sessionFile, 'utf8');
                sessionData = JSON.parse(data);
            }
            
            sessionData.prefix = newPrefix;
            sessionData.updatedAt = new Date().toISOString();
            
            fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
        } catch (error) {
            console.error('Failed to save prefix:', error);
        }

        return m.reply(`Prefix changed to: \`${newPrefix}\``);
    }
};
