const fetch = require('node-fetch');
const regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;

module.exports = {
    name: 'gitdl',
    description: 'Download GitHub repository as zip',
    aliases: ['github', 'git'],
    tags: ['download'],
    command: /^\.?(gitdl|github|git)/i,

    async execute(sock, m, args) {
        try {
            if (!args[0]) {
                return m.reply(`Please provide a GitHub link\n\nExample: .gitdl https://github.com/salmanytofficial/XLICON-V2-MD`);
            }

            if (!regex.test(args[0])) {
                return m.reply('Invalid GitHub link format');
            }

            let [_, user, repo] = args[0].match(regex) || [];
            repo = repo.replace(/.git$/, '');
            
            const url = `https://api.github.com/repos/${user}/${repo}/zipball`;
            
            const response = await fetch(url, { method: 'HEAD' });
            const contentDisposition = response.headers.get('content-disposition');
            
            if (!contentDisposition) {
                return m.reply('Repository not found or access denied');
            }
            
            const filename = contentDisposition.match(/attachment; filename=(.*)/)[1];
            
            await m.reply('Downloading repository... Please wait');
            
            await sock.sendMessage(m.from, {
                document: { url: url },
                fileName: filename,
                mimetype: 'application/zip'
            }, { quoted: m });

        } catch (err) {
            console.error('GitDL Error:', err);
            
            if (err.message.includes('404')) {
                return m.reply('Repository not found');
            } else if (err.message.includes('rate limit')) {
                return m.reply('GitHub API rate limit exceeded');
            } else {
                return m.reply('Failed to download repository');
            }
        }
    }
};
