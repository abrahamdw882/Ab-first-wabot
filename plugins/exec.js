const util = require('util');
const axios = require('axios');

let sentOnce = new Set();

module.exports = {
  name: 'exec',
  aliases: ['$'],
  description: 'Execute JavaScript code (Owner only)',

  async execute() {},

  async onMessage(sock, m) {
    if (!m.text) return;
    if (!m.text.startsWith('$')) return;
    if (sentOnce.has(m.id)) return;
    sentOnce.add(m.id);

    const owners = global.owners || [];

    const normalize = (jid) => jid?.split(':')[0];

    const isOwner =
      owners.map(normalize).includes(normalize(m.sender)) ||
      normalize(m.sender) === normalize(sock.user.id);

    if (!isOwner) return;

    const code = m.text.slice(1).trim();

    const info = '*ABZTech Exec*';
    const imgUrl = 'https://i.ibb.co/65fwTVG/carbon-3.png';
    const author = 'XLIOCN V2';
    const botname = 'XLIOCN  ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ';
    const sourceUrl = 'https://abztech.xyz/';

    try {
      const sandbox = {
        sock,
        m,
        axios,
        util,
        console,
        proto,
        prepareWAMessageMedia,
        generateWAMessageFromContent: global.generateWAMessageFromContent
      };

      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

      let result;
      if (code.includes('await') || code.includes('\n')) {
        result = await new AsyncFunction(...Object.keys(sandbox), code)(
          ...Object.values(sandbox)
        );
      } else {
        result = await new Function(
          ...Object.keys(sandbox),
          `return ${code}`
        )(...Object.values(sandbox));
      }

      const output =
        result === undefined
          ? 'undefined'
          : typeof result === 'string'
          ? result
          : util.inspect(result, { depth: 1 });

      const text = `☑️ Result:\n\`\`\`\n${output.slice(0, 4000)}\n\`\`\``;

      const thumbnailBuffer = (
        await axios.get(imgUrl, { responseType: 'arraybuffer' })
      ).data;

      await m.send(`${info}\n${text}`, {
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
      await m.send(`❌ Error:\n\`\`\`\n${err.message}\n\`\`\``);
    }

    setTimeout(() => sentOnce.delete(m.id), 5000);
  }
};
