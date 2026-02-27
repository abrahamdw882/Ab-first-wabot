const axios = require('axios');

module.exports = {
    name: 'menu',
    description: 'Show available bot commands',

    async execute(sock, m) {
        const prefix = '.';

        const menuText = `
XLIOCN *ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ*  

  ┌─ム *Available Commands*
  ┃ ᪣ ${prefix}alive
  ┃ ᪣ ${prefix}arise
  ┃ ᪣ ${prefix}poll
  ┃ ᪣ ${prefix}couplepp
  ┃ ᪣ ${prefix}owner
  ┃ ᪣ >
  ┃ ᪣ ${prefix}ping
  ┃ ᪣ ${prefix}sticker
  ┃ ᪣ ${prefix}tagall
  ┃ ᪣ ${prefix}tagme
  ┃ ᪣ ${prefix}uptime
  ┃ ᪣ ${prefix}tts
  ┃ ᪣ ${prefix}ai
  ┃ ᪣ ${prefix}ocr
  ┃ ᪣ ${prefix}tagall1
  ┃ ᪣ ${prefix}ai-search
  ┃ ᪣ ${prefix}gstatus
  ╰─────────◆────────╯

> 「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」
        `.trim();

        const imgUrl = 'https://files.catbox.moe/uz899q.jpg';
        const author = 'XLICON V2';
        const botname = 'XLICON ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ';
        const sourceUrl = 'https://abztech.my.id/';

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
