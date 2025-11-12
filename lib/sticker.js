const fetch = require('node-fetch');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
/**
 * Creates a sticker from an image or a URL.
 *
 * This asynchronous function checks if an image is provided; if not, it fetches the image from the given URL.
 * It then creates a sticker package using the Sticker class, setting the pack name, author, type, and quality.
 * Finally, it returns the sticker as a buffer.
 *
 * @param {Buffer|string} img - The image buffer or a URL to the image.
 * @param {string} url - The URL to fetch the image if no image buffer is provided.
 * @param {string} [packname='Bot'] - The name of the sticker pack.
 * @param {string} [author='Bot'] - The author of the sticker.
 */
async function createSticker(img, url, packname = 'Bot', author = 'Bot') {
    let media = img;
    if (!media && url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        media = await res.buffer();
    }

    const stickerPkg = new Sticker(media, {
        pack: packname,
        author: author,
        type: StickerTypes.DEFAULT,
        quality: 80,
    });

    return await stickerPkg.toBuffer();
}

module.exports = { createSticker };
