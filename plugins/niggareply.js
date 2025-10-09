module.exports = {
    name: 'autoniggareply',
    description: 'Replies',

    async execute() {},

    async onMessage(sock, m) {
        try {
            if (!m || !m.from) return;

            const target = '195692299612239@lid';
            const text = (m.body || m.quoted?.body || '').toLowerCase();

            if (m.sender === target && /blind\s*fella/i.test(text)) {
                await sock.sendMessage(m.from, { text: "My master isn't blind nigga." });
            }
        } catch (err) {
            console.error('error:', err);
        }
    }
};
