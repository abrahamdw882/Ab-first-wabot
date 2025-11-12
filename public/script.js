console.log('ABZTech WhatsApp Bot Interface Loaded');

function getStatusConfig(status) {
    const statusConfig = {
        'connecting': { class: 'status-connecting', icon: 'fas fa-sync-alt fa-spin', text: 'Connecting' },
        'connected': { class: 'status-connected', icon: 'fas fa-check-circle', text: 'Connected' },
        'disconnected': { class: 'status-disconnected', icon: 'fas fa-times-circle', text: 'Disconnected' }
    };
    
    return statusConfig[status] || statusConfig.disconnected;
}

/**
 * Updates the status badge based on the provided status.
 *
 * This function retrieves the status badge and status text elements from the DOM.
 * If both elements exist, it fetches the configuration for the given status using
 * the getStatusConfig function. It then updates the badge's class, icon, and text
 * accordingly, ensuring to remove any previous status classes.
 *
 * @param {string} status - The current status to update the badge with.
 */
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

/**
 * Updates the QR code display in the specified container.
 *
 * This function checks if the qrContainer element exists and whether a valid qrUrl is provided.
 * If both are present, it updates the container with the QR code image and instructions.
 * If the qrUrl is not provided, it displays a placeholder indicating that the QR code is not available.
 *
 * @param {string} qrUrl - The URL of the QR code image to be displayed.
 */
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

/**
 * Updates the visibility of the warning message based on the connection status.
 */
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
        const response = await fetch('/api/status?' + new Date().getTime());
        const data = await response.json();
        window.botStatus = data.botStatus;
        
        console.log('Status update:', data.botStatus, 'Has QR:', data.hasQR);
        
        updateStatusBadge(data.botStatus);
        
        if (data.hasQR && data.latestQR) {
            updateQRCode(data.latestQR);
        } else {
            updateQRCode(null);
        }
        
        updatePairingFormStatus(data.botStatus);
        
        document.title = `QR Code - ABZTech ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ (${data.botStatus.charAt(0).toUpperCase() + data.botStatus.slice(1)})`;
        
    } catch (error) {
        console.error('Error fetching status:', error);
        updateStatusBadge('disconnected');
        updateQRCode(null);
    }
}

/**
 * Sets up the pairing form submission handler.
 *
 * This function retrieves the pairing form element and adds an event listener for the submit event.
 * Upon submission, it prevents the default behavior, updates the submit button to indicate loading,
 * and sends the form data to the server. Depending on the server response, it either displays the
 * generated pairing code and instructions or alerts the user of an error.
 */
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
                                <div class="status-badge ${getStatusConfig(window.botStatus).class} fade-in">
                                    <i class="${getStatusConfig(window.botStatus).icon}"></i>
                                    <span>${getStatusConfig(window.botStatus).text}</span>
                                </div>
                                
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
