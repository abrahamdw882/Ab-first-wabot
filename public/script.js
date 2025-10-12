console.log('ABZTech WhatsApp Bot Interface Loaded');
function updateStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            document.title = `ABZTech - ${data.botStatus.charAt(0).toUpperCase() + data.botStatus.slice(1)}`;
        })
        .catch(console.error);
}

setInterval(updateStatus, 10000);
updateStatus();
