module.exports = {
    name: 'tts',
    description: 'Convert text to speech using Jane voice',
    aliases: [],
    tags: ['main'],
    command: /^\.?tts/i,

    async execute(sock, m) {
        try {
            let text = m.text?.replace(/^\.?tts\s*/i, '').trim();
            if (!text) return m.reply('Please provide some text to convert to speech.');

            const name = m.pushName || m.sender.split('@')[0];
            const quoted = {
                key: {
                    fromMe: false,
                    participant: m.sender,
                    ...(m.isGroup ? { remoteJid: m.from } : {}),
                },
                message: {
                    contactMessage: {
                        displayName: name,
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;a,;;;\nFN:${name}\nitem1.TEL;waid=${m.sender.split('@')[0]}:${m.sender.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`,
                    },
                },
            };

            const fetch = require('node-fetch');
            const response = await fetch(
                `https://ab-text-voice.abrahamdw882.workers.dev/?q=${encodeURIComponent(text)}&voicename=jane`
            );
            const data = await response.json();
            const audioUrl = data.url;

            await m.send(
                {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    ptt: true,
                    fileName: 'TTS',
                    contextInfo: {
                        mentionedJid: [m.sender],
                        externalAdReply: {
                            title: 'TTS',
                            mediaType: 1,
                            renderLargerThumbnail: true,
                        },
                    },
                },
                { quoted }
            );
        } catch (err) {
            console.error(' TTS plugin error:', err);
            m.reply('Failed to generate TTS.');
        }
    },
};
