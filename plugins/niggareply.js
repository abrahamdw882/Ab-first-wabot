module.exports = {
    name: 'autoniggareply',
    description: 'Replies when a specific person says blind fella',

    async execute() {},

    async onMessage(sock, m) {
        try {
            if (!m.body) return;

            const target = '195692299612239@lid';
            if (
                m.sender === target &&
                /blind\s*fella/i.test(m.body)
            ) {
                await sock.sendMessage(m.from, { text: "My master isn't blind nigga." }, { quoted: m });
            }
        } catch (err) {
            console.error('error:', err);
        }
    }
};
