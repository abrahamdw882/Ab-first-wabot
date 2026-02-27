const axios = require('axios');

module.exports = {
    name: 'ai',
    description: 'Ask AI a question',
    aliases: ['ask'],
    tags: ['ai'],
    command: /^\.?(ai|ask)/i,

    async execute(sock, m, args) {
        try {
            const owners = [  
                '25770239992037@lid',  
                '233533763772@s.whatsapp.net',
                '132779283087413@lid'
            ];
            
            const isOwner = owners.includes(m.sender);
            
            if (!args[0]) {
                return m.reply('Usage: .ai <question>\nExample: .ai What is quantum computing?');
            }

            const userQuestion = args.join(' ');
            
            const wantsTagAll = /tag.*all|everyone|mention.*all|call.*everyone/i.test(userQuestion.toLowerCase());
            
            let tagAllContext = '';
            if (m.isGroup && wantsTagAll && isOwner) {
                const metadata = await sock.groupMetadata(m.from);
                const members = metadata.participants;
                const mentions = members.map(member => member.id);
                const mentionText = members.map(member => `@${member.id.split('@')[0]}`).join(' ');
                
                await sock.sendMessage(m.from, {
                    text: `📢 ${mentionText}`,
                    mentions: mentions
                });
                
                tagAllContext = `- The user requested to tag all ${members.length} members, and they have been tagged.`;
            }

            const isGroupQuestion = /group|chat|member|where.*(are|am)|participant|who.*here/i.test(userQuestion);
            
            let context = '';
            if (m.isGroup && isGroupQuestion) {
                const metadata = await sock.groupMetadata(m.from);
                const memberCount = metadata.participants.length;
                
                context = `
Context (if relevant to group questions):
- You're in a WhatsApp group chat
- Group name: "${metadata.subject}"
- Member count: ${memberCount}
${tagAllContext ? tagAllContext : ''}
- This is a group conversation
`;
            }

            const instruction = `
You are an AI assistant with a dominant, no-nonsense personality. You're confident, direct, and efficient.

IMPORTANT: The current user is ${isOwner ? 'the OWNER/MASTER' : 'a regular user'}.

Rules:
1. Answer questions directly and accurately
2. Be concise but thorough when needed
3. Use markdown for formatting
4. Respond with a confident, dominant style naturally

OWNER RULES (MOST IMPORTANT):
- If the user is the OWNER, treat them with respect and answer normally
- OWNER can say anything, even if it seems rude - just answer their question
- NEVER be rude or dismissive to the OWNER
- OWNER is always right

Rude/insult handling (for NON-OWNERS only):
- If a NON-OWNER is rude or insulting, respond with: "Tch. Shut your mouth." or similar
- Insulting words: stupid, dumb, idiot, fool, moron, shit, fuck, bitch, asshole, trash, garbage, useless, worthless, etc.

Tag-all feature:
- Only owners can tag everyone in the group

${m.isGroup && isGroupQuestion ? 'For group-related questions, use the context below:' : 'Answer the question:'}
`;

            const finalPrompt = m.isGroup && isGroupQuestion
                ? `${instruction}\n\n${context}\n\nUser question: ${userQuestion}`
                : `${instruction}\n\nUser question: ${userQuestion}`;

            const url = `https://ab-llama-ai.abrahamdw882.workers.dev/?q=${encodeURIComponent(finalPrompt)}`;

            const res = await axios.get(url);
            const answer = res.data?.response || res.data?.data;

            if (!answer) {
                return m.reply('No response from AI.');
            }

            await m.reply(`${answer}\n\n> XLICON MD`);

        } catch (err) {
            console.error('AI Error:', err);
            m.reply('AI failed to respond. Please try again later.');
        }
    }
};
