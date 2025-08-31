const axios = require('axios');

module.exports = {
    name: "carbon",
    aliases: ["carbonify"],
    description: "Generate a stylized Carbon image from text",
    
    async execute(sock, m, args) {
        if (!args || args.length === 0) {
            return await m.send("❌ Please provide some text to generate Carbon.");
        }

        const text = args.join(" ");
        const theme = "seti";

        try {
            const res = await axios.get(`https://ab-carbon.abrahamdw882.workers.dev/?q=${encodeURIComponent(text)}&theme=${theme}`, {
                responseType: 'arraybuffer'
            });
            const buffer = Buffer.from(res.data, 'binary');
            await sock.sendMessage(m.from, {
                image: buffer,
                caption: `Here's your stylized Carbon snippet:`
            }, { quoted: m._raw });

        } catch (err) {
            await m.send(`❌ Error generating Carbon image:\n\`\`\`\n${err.message}\n\`\`\``);
        }
    }
};
