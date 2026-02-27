console.log('ABZTech WhatsApp Bot Interface Loaded');

function getStatusConfig(status) {
    const statusConfig = {
        'connecting': { class: 'status-connecting', icon: 'fas fa-sync-alt fa-spin', text: 'Connecting' },
        'connected': { class: 'status-connected', icon: 'fas fa-check-circle', text: 'Connected' },
        'disconnected': { class: 'status-disconnected', icon: 'fas fa-times-circle', text: 'Disconnected' }
    };
    
    return statusConfig[status] || statusConfig.disconnected;
}

function updateStatusBadge(status) {
    const statusBadge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    
    if (!statusBadge || !statusText) {
        return;
    }
    
    const statusIcon = statusBadge.querySelector('i');
    
    if (statusBadge && statusText && statusIcon) {
        const config = getStatusConfig(status);
        statusBadge.classList.remove('status-connecting', 'status-connected', 'status-disconnected');
        statusBadge.classList.add(config.class);
        statusIcon.className = config.icon;
        statusText.textContent = config.text;
    }
}

function updateQRCode(qrUrl) {
    const qrContainer = document.getElementById('qr-container');
    if (!qrContainer) return;
    
    if (qrUrl) {
        qrContainer.innerHTML = `
            <div class="qr-container">
                <img src="${qrUrl}" alt="WhatsApp QR Code" class="qr-code">
                <p class="qr-instruction">
                    <i class="fas fa-info-circle"></i>
                    Open WhatsApp → Settings → Linked Devices → Scan QR Code
                </p>
            </div>
        `;
    } else {
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
        warningMessage.style.display = status !== 'connecting' ? 'block' : 'none';
    }
}

async function updateStatus() {
    try {
        const response = await fetch('/api/status?' + new Date().getTime());
        const data = await response.json();
        
        // Store status globally
        window.botStatus = data.status;
        
        console.log('Status update:', data.status, 'Has QR:', data.hasQR);
        
        // Update UI elements
        updateStatusBadge(data.status);
        updateQRCode(data.qr);
        updatePairingFormStatus(data.status);
        
        // Update page title based on current page
        const path = window.location.pathname;
        const statusCapitalized = data.status.charAt(0).toUpperCase() + data.status.slice(1);
        
        if (path === '/qr') {
            document.title = `QR Code - ABZTech ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ (${statusCapitalized})`;
        } else if (path === '/pair') {
            document.title = `Pairing - ABZTech ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ (${statusCapitalized})`;
        } else {
            document.title = `ABZTech ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ (${statusCapitalized})`;
        }
        
    } catch (error) {
        console.error('Error fetching status:', error);
        updateStatusBadge('disconnected');
        updateQRCode(null);
    }
}

function setupPairingForm() {
    const pairForm = document.getElementById('pairForm');
    if (!pairForm) return;
    
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
                // Format the pairing code in groups of 4 digits for better readability
                const formattedCode = result.code.match(/.{1,4}/g)?.join(' ') || result.code;
                
                const main = document.querySelector('main');
                main.innerHTML = `
                    <div class="container">
                        <div class="hero">
                            <h1 class="hero-title">✅ Pairing Code Generated</h1>
                            <p class="hero-subtitle">Use this code to link your WhatsApp account</p>
                            <div id="status-badge" class="status-badge ${getStatusConfig(window.botStatus).class} fade-in">
                                <i class="${getStatusConfig(window.botStatus).icon}"></i>
                                <span id="status-text">${getStatusConfig(window.botStatus).text}</span>
                            </div>
                        </div>
                        
                        <div class="card fade-in success-card">
                            <div class="phone-info">
                                <p class="phone-label">For phone number:</p>
                                <h3 class="phone-number">+${result.phone}</h3>
                            </div>
                            
                            <div class="pairing-code pulse">
                                ${formattedCode}
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
                                        <p>Type: <strong>${result.code}</strong></p>
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
                alert('Error: ' + (result.error || 'Unknown error'));
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

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing ABZTech WhatsApp Bot interface...');
    
    // Setup form if on pair page
    setupPairingForm();
    
    // Initial status update
    updateStatus();
    
    // Update status every 2 seconds
    setInterval(updateStatus, 2000);
});

// Global bot status variable
window.botStatus = 'disconnected';
