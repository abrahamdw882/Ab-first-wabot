console.log('ABZTech WhatsApp Bot Interface Loaded');

function getStatusBadge(status) {
    const statusConfig = {
        'connecting': { class: 'status-connecting', icon: 'fas fa-sync-alt fa-spin', text: 'Connecting' },
        'connected': { class: 'status-connected', icon: 'fas fa-check-circle', text: 'Connected' },
        'disconnected': { class: 'status-disconnected', icon: 'fas fa-times-circle', text: 'Disconnected' }
    };
    
    const config = statusConfig[status] || statusConfig.disconnected;
    return {
        html: `<div class="status-badge ${config.class} fade-in">
            <i class="${config.icon}"></i>
            ${config.text}
        </div>`,
        config: config
    };
}

function updateStatusBadge(status) {
    const statusBadge = document.getElementById('status-badge');
    
    if (statusBadge) {
        const badge = getStatusBadge(status);
        statusBadge.outerHTML = badge.html;
    }
}

function updateQRCode(qrUrl) {
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer && qrUrl) {
        qrContainer.innerHTML = `
            <div class="qr-container">
                <img src="${qrUrl}" alt="WhatsApp QR Code" class="qr-code">
                <p class="qr-instruction">
                    <i class="fas fa-info-circle"></i>
                    Open WhatsApp → Settings → Linked Devices → Scan QR Code
                </p>
            </div>
        `;
    } else if (qrContainer && !qrUrl) {
        qrContainer.innerHTML = `
            <div class="qr-container">
                <i class="fas fa-qrcode qr-placeholder"></i>
                <h3>QR Code Not Available</h3>
                <p>Please wait for the bot to generate a QR code or use the pairing method instead.</p>
            </div>
        `;
    }
}

function updatePairingFormStatus(status) {
    const warningMessage = document.getElementById('warning-message');
    if (warningMessage) {
        if (status !== 'connecting') {
            warningMessage.style.display = 'block';
        } else {
            warningMessage.style.display = 'none';
        }
    }
}

async function updateStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        window.botStatus = data.botStatus;
        
        updateStatusBadge(data.botStatus);
        updateQRCode(data.latestQR);
        updatePairingFormStatus(data.botStatus);
        
        document.title = `ABZTech - ${data.botStatus.charAt(0).toUpperCase() + data.botStatus.slice(1)}`;
        
    } catch (error) {
        console.error('Error fetching status:', error);
    }
}

function setupPairingForm() {
    const pairForm = document.getElementById('pairForm');
    if (pairForm) {
        pairForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const button = this.querySelector('button[type="submit"]');
            const originalText = button.innerHTML;
            
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating Code...';
            button.disabled = true;

            const formData = new FormData(this);
            
            try {
                const response = await fetch('/api/pair', {
                    method: 'POST',
                    body: new URLSearchParams(formData)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    const main = document.querySelector('main');
                    main.innerHTML = `
                        <div class="container">
                            <div class="hero">
                                <h1 class="hero-title">Pairing Code Generated</h1>
                                <p class="hero-subtitle">Use this code to link your WhatsApp account</p>
                            </div>
                            
                            <div class="card fade-in success-card">
                                ${getStatusBadge(window.botStatus).html}
                                
                                <div class="phone-info">
                                    <p class="phone-label">For phone number:</p>
                                    <h3 class="phone-number">+${result.phoneNumber}</h3>
                                </div>
                                
                                <div class="pairing-code pulse">
                                    ${result.pairingCode.match(/.{1,4}/g)?.join(' ') || result.pairingCode}
                                </div>
                                
                                <div class="steps">
                                    <div class="step">
                                        <div class="step-number">1</div>
                                        <div class="step-content">
                                            <strong>Open WhatsApp</strong>
                                            <p>Launch WhatsApp on your mobile device</p>
                                        </div>
                                    </div>
                                    <div class="step">
                                        <div class="step-number">2</div>
                                        <div class="step-content">
                                            <strong>Go to Linked Devices</strong>
                                            <p>Settings → Linked Devices</p>
                                        </div>
                                    </div>
                                    <div class="step">
                                        <div class="step-number">3</div>
                                        <div class="step-content">
                                            <strong>Link a Device</strong>
                                            <p>Tap "Link a Device" option</p>
                                        </div>
                                    </div>
                                    <div class="step">
                                        <div class="step-number">4</div>
                                        <div class="step-content">
                                            <strong>Enter Code</strong>
                                            <p>Type: <strong>${result.pairingCode}</strong></p>
                                        </div>
                                    </div>
                                </div>
                                
                                <p class="expiry-note">
                                    <i class="fas fa-clock"></i>
                                    This code will expire in 10 minutes
                                </p>
                                
                                <div class="action-buttons">
                                    <a href="/pair" class="btn">
                                        <i class="fas fa-plus"></i>
                                        New Code
                                    </a>
                                    <a href="/qr" class="btn btn-outline">
                                        <i class="fas fa-qrcode"></i>
                                        QR Code
                                    </a>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    alert('Error: ' + result.error);
                    button.innerHTML = originalText;
                    button.disabled = false;
                }
            } catch (error) {
                console.error('Error generating pairing code:', error);
                alert('Error generating pairing code. Please try again.');
                button.innerHTML = originalText;
                button.disabled = false;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing ABZTech WhatsApp Bot interface...');
    
    setupPairingForm();
    updateStatus();
    
    setInterval(updateStatus, 2000);
});

window.botStatus = 'disconnected';
