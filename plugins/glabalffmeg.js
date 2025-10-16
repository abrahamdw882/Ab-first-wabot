const fs = require("fs");

module.exports = {
    name: "installffmpeg",
    description: "Install ffmpeg globally for media conversion",
    aliases: ["ffmpegsetup"],
    tags: ["system"],
    command: /^(installffmpeg|ffmpegsetup)$/i,

    async execute(sock, m) {
        try {
            const { path: ffmpegPath } = require("@ffmpeg-installer/ffmpeg");
            const globalBin = "/usr/local/bin/ffmpeg";

            if (!fs.existsSync(globalBin)) {
                await m.send({ text: "Installing ffmpeg globally..." });

                fs.copyFileSync(ffmpegPath, globalBin);
                fs.chmodSync(globalBin, 0o755);

                await m.send({ text: "ffmpeg has been installed globally!" });
                console.log("ffmpeg installed globally at", globalBin);
            } else {
                await m.send({ text: "ffmpeg already exists globally." });
                console.log("ffmpeg already exists globally at", globalBin);
            }
        } catch (err) {
            console.error("Failed to install ffmpeg:", err);
            await m.send({ text: "Failed to install ffmpeg: " + err.message });
        }
    },
};
