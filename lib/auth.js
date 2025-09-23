require('.././config')
const fs = require('fs')

function restoreAuthFiles() {
    return new Promise((resolve) => {
        db.all("SELECT * FROM sessions", (err, rows) => {
            if (err) return console.error("DB restore error:", err);
            if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER);
            rows.forEach(row => {
                fs.writeFileSync(path.join(AUTH_FOLDER, row.filename), row.content, 'utf8');
            });
            resolve();
        });
    });
}

function saveAuthFilesToDB() {
    try {
        if (!fs.existsSync(AUTH_FOLDER)) return;
        fs.readdirSync(AUTH_FOLDER).forEach(file => {
            const filePath = path.join(AUTH_FOLDER, file);
            const content = fs.readFileSync(filePath, 'utf8');
            db.run("INSERT OR REPLACE INTO sessions (filename, content) VALUES (?, ?)", [file, content], (err) => {
                if (err) console.error(`Failed to save ${file}:`, err);
            });
        });
    } catch (error) {
        console.error('Error saving auth files to DB:', error);
    }
}

module.exports = { restoreAuthFiles, saveAuthFilesToDB }
