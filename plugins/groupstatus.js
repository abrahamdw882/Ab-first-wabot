const { prepareWAMessageMedia, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'groupstatus',
    description: 'Send group status silently',
    aliases: ['gstatus'],
    tags: ['group'],
    command: /^\.?(groupstatus|gstatus)$/i,

    async execute(sock, m, args) {
        try {

            const normalize = jid => jid?.split(':')[0];

            const sender = normalize(m.sender);
            const botId = normalize(sock.user.id);
            const owners = (global.owners || []).map(normalize);

            const isOwner =
                owners.includes(sender) ||
                sender === botId;

            if (!isOwner) return;
            if (!m.isGroup) return;

            const groupId = m.from;
            const quoted = m.quoted;

            const COLORS = {
                green: 0xFF25D366,
                red: 0xFFFF0000,
                blue: 0xFF0000FF,
                yellow: 0xFFFFFF00,
                purple: 0xFF800080,
                black: 0xFF000000,
                white: 0xFFFFFFFF,
                orange: 0xFFFFA500
            };

            let innerMessage;

            if (!quoted) {
                if (!args.length) return;

                const fullText = args.join(' ');
                let messageText = fullText;
                let chosenColor = COLORS.green;

                if (fullText.includes(',')) {
                    const parts = fullText.split(',');
                    const possibleColor = parts.pop().trim().toLowerCase();
                    messageText = parts.join(',').trim();

                    if (COLORS[possibleColor]) {
                        chosenColor = COLORS[possibleColor];
                    }
                }

                innerMessage = {
                    extendedTextMessage: {
                        text: messageText,
                        backgroundArgb: chosenColor,
                        font: 1
                    }
                };
            }

            else if (quoted.message?.imageMessage) {

                const buffer = await quoted.download();

                const media = await prepareWAMessageMedia(
                    {
                        image: buffer,
                        caption: quoted.message.imageMessage.caption || ''
                    },
                    { upload: sock.waUploadToServer }
                );

                innerMessage = { imageMessage: media.imageMessage };
            }

            else if (quoted.message?.videoMessage) {

                const buffer = await quoted.download();

                const media = await prepareWAMessageMedia(
                    {
                        video: buffer,
                        caption: quoted.message.videoMessage.caption || ''
                    },
                    { upload: sock.waUploadToServer }
                );

                innerMessage = { videoMessage: media.videoMessage };
            }

            else if (quoted.message?.audioMessage) {

                const buffer = await quoted.download();

                const media = await prepareWAMessageMedia(
                    {
                        audio: buffer,
                        mimetype: quoted.message.audioMessage.mimetype || 'audio/mp4',
                        ptt: quoted.message.audioMessage.ptt || false
                    },
                    { upload: sock.waUploadToServer }
                );

                innerMessage = { audioMessage: media.audioMessage };
            }

            else {
                return;
            }

            const content = {
                groupStatusMessageV2: {
                    message: innerMessage
                }
            };

            const msg = generateWAMessageFromContent(
                groupId,
                proto.Message.fromObject(content),
                { userJid: sock.user.id }
            );

            await sock.relayMessage(
                groupId,
                msg.message,
                { messageId: msg.key.id }
            );

        } catch (err) {
            console.error('GroupStatus Error:', err);
        }
    }
};
