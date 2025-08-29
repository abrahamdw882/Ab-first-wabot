const axios = require('axios');

module.exports = {
    name: 'menu',
    description: 'Show available bot commands',

    async execute(sock, m) {
        const prefix = '.';

        const menuText = `
             ABZTech *ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ*  

  ┌─ム *Available Commands*
  ┃ ᪣  ${prefix}alive
  ┃ ᪣  ${prefix}arise
  ┃ ᪣  ${prefix}chatbot
  ┃ ᪣  ${prefix}couplepp
  ┃ ᪣  ${prefix}owner
  ┃ ᪣   >
  ┃ ᪣  ${prefix}ping
  ┃ ᪣  ${prefix}sticker
  ┃ ᪣  ${prefix}tagall
  ┃ ᪣  ${prefix}tagme
  ┃ ᪣  ${prefix}uptime
  ╰─────────◆────────╯
> 「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」
        `.trim();

        const imgUrl = 'https://i.ibb.co/KpcF9Gnf/4f41074aab5a035fcac5e111911b2456-1.jpg';
        const author = 'ABZTech';
        const botname = 'ABZTech ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ';
        const sourceUrl = 'https://abztech.xyz/';

        try {
            const thumbnailBuffer = (await axios.get(imgUrl, { responseType: 'arraybuffer' })).data;

            await m.send(menuText, {
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    externalAdReply: {
                        title: author,
                        body: botname,
                        thumbnail: thumbnailBuffer,
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl
                    }
                }
            });
        } catch (err) {
            console.error('❌ Error sending menu:', err);
            await m.reply('⚠️ Failed to send menu.');
        }
    }
};
