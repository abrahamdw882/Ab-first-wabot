/**
 * Serialize Message
 * Created By ABZTECH
 * Follow https://github.com/abrahamdw882
 * Whatsapp : https://whatsapp.com/channel/0029VaMGgVL3WHTNkhzHik3c
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys'); 

/**
 * Serialize a message object for further processing and interaction.
 *
 * This function extracts various properties from the message, including sender information, body content, and media type.
 * It also handles quoted messages and provides methods for replying, sending, reacting, forwarding, and downloading media.
 * Group metadata is fetched if the message is from a group chat, and the function ensures that all necessary data is structured for easy access.
 *
 * @param sock - The socket connection used for sending and receiving messages.
 * @param msg - The message object containing details about the message to be serialized.
 * @returns An object representing the serialized message with methods for interaction.
 */
async function serializeMessage(sock, msg) {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.fromMe ? sock.user.id : (isGroup ? msg.key.participant : from);
    const pushName = msg.pushName || sender.split('@')[0];

    const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg.message?.templateButtonReplyMessage?.selectedId ||
        msg.message?.interactiveResponseMessage?.body?.text ||
        '';

    const type = Object.keys(msg.message || {})[0] || '';
    const isMedia = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage'].includes(type);
    const mediaType = type.replace('Message', '').toLowerCase();
    const mimetype = msg.message?.[type]?.mimetype || null;

    const groupMetadata = isGroup ? await sock.groupMetadata(from).catch(() => {}) : '';

    let quoted;
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (ctxInfo?.quotedMessage) {
        const qMsg = ctxInfo.quotedMessage;
        const qType = Object.keys(qMsg)[0] || '';
        quoted = {
            key: { remoteJid: from, id: ctxInfo.stanzaId, participant: ctxInfo.participant || from },
            message: qMsg,
            type: qType,
            body: qMsg?.conversation || qMsg?.extendedTextMessage?.text || qMsg?.[qType]?.caption || '',
            isMedia: ['imageMessage','videoMessage','documentMessage','audioMessage','stickerMessage'].includes(qType),
            mediaType: qType.replace('Message','').toLowerCase(),
            mimetype: qMsg?.[qType]?.mimetype || null,
            download: async () => await downloadMediaMessage({ message: qMsg, key: { ...msg.key } }, 'buffer', {}, sock)
        };
    }

    return {
        id: msg.key.id,
        from,
        sender,
        pushName,
        isGroup,
        groupMetadata,
        body,
        text: body,
        type,
        mtype: type,
        isMedia,
        mediaType,
        mimetype,
        quoted,
        reply: async (text, options={}) => await sock.sendMessage(from, { text, ...options }, { quoted: msg }),
        send: async (content, options={}) => await sock.sendMessage(from, typeof content === 'string' ? { text: content, ...options } : content, { quoted: msg }),
        react: async emoji => await sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
        forward: async (jid, force=false) => await sock.sendMessage(jid, { forward: msg, force }),
        download: async () => isMedia ? await downloadMediaMessage(msg, 'buffer', {}, sock) : (quoted?.isMedia ? await quoted.download() : null)
    };
}

module.exports = serializeMessage;
