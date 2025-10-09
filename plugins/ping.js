const axios = require('axios');

module.exports = {
    name: 'ping',
    aliases: ['speed', 'latency'],
    description: 'Check bot response speed',

    async execute(sock, m, args) {
        const start = Date.now();
        await m.reply('Pinging...');
        const latency = Date.now() - start;
        const info = `> Latency: ${latency} ms`;
        const imgUrl = 'https://i.ibb.co/65fwTVG/carbon-3.png';
        const author = 'ABZTech';
        const botname = 'ABZTech ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ';
        const sourceUrl = 'https://abztech.xyz/';

        try {
            const thumbnailBuffer = (await axios.get(imgUrl, { responseType: 'arraybuffer' })).data;

            await m.send(info, {
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
            console.error('Error sending ping info:', err);
        }
    }
};
