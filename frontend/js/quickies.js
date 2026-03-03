/**
 * Quickies Manager - One-click session launcher
 * Manages quick launch buttons and their configuration
 */

class QuickiesManager {
    constructor() {
        this.quickies = [];
        this.presets = [];
        this.isLoading = false;
        this.editingId = null;
    }

    getToken() {
        if (window.RXCAFE_TOKEN) {
            return window.RXCAFE_TOKEN;
        }
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('token');
    }

    apiUrl(path) {
        const token = this.getToken();
        const url = new URL(path, window.location.origin);
        if (token) url.searchParams.set('token', token);
        return url.toString();
    }

    async init() {
        this.bindElements();
        this.bindEvents();
        await this.loadQuickies();
        // Don't load presets on init - load them when modal opens
    }

    bindElements() {
        this.quickiesView = document.getElementById('quickies-view');
        this.quickiesGrid = document.getElementById('quickies-grid');
        this.messagesEl = document.getElementById('messages');
        this.manageBtn = document.getElementById('manage-quickies-btn');
        this.navBtn = document.getElementById('quickies-nav-btn');
        
        // Modal elements
        this.modal = document.getElementById('quickies-modal');
        this.modalClose = document.getElementById('quickies-modal-close');
        this.quickiesList = document.getElementById('quickies-list');
        this.form = document.getElementById('quickie-form');
        this.formTitle = document.getElementById('quickie-form-title');
        this.cancelBtn = document.getElementById('quickie-cancel');
        
        // Form fields
        this.presetSelect = document.getElementById('quickie-preset');
        this.nameInput = document.getElementById('quickie-name');
        this.descInput = document.getElementById('quickie-description');
        this.emojiInput = document.getElementById('quickie-emoji');
        this.gradientStart = document.getElementById('quickie-gradient-start');
        this.gradientEnd = document.getElementById('quickie-gradient-end');
        this.starterInput = document.getElementById('quickie-starter');
        this.uiMode = document.getElementById('quickie-ui-mode');
        this.idInput = document.getElementById('quickie-id');
        this.previewBtn = document.getElementById('quickie-preview');
    }

    bindEvents() {
        this.manageBtn?.addEventListener('click', () => this.showModal());
        this.navBtn?.addEventListener('click', () => this.showQuickies());
        this.modalClose?.addEventListener('click', () => this.hideModal());
        this.cancelBtn?.addEventListener('click', () => this.resetForm());
        
        this.form?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveQuickie();
        });

        // Live preview updates
        this.emojiInput?.addEventListener('input', () => this.updatePreview());
        this.nameInput?.addEventListener('input', () => this.updatePreview());
        this.gradientStart?.addEventListener('input', () => this.updatePreview());
        this.gradientEnd?.addEventListener('input', () => this.updatePreview());

        // Close modal on backdrop click
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hideModal();
        });
    }

    updatePreview() {
        if (!this.previewBtn) return;
        
        const emoji = this.emojiInput?.value || '🚀';
        const name = this.nameInput?.value || 'Preview';
        const start = this.gradientStart?.value || '#6366f1';
        const end = this.gradientEnd?.value || '#8b5cf6';
        
        this.previewBtn.style.background = `linear-gradient(135deg in oklch, ${start}, ${end})`;
        this.previewBtn.innerHTML = `
            <span class="quickie-emoji">${emoji}</span>
            <span class="quickie-name">${name}</span>
        `;
    }

    async loadQuickies() {
        try {
            const response = await fetch(this.apiUrl('/api/quickies'));
            const data = await response.json();
            this.quickies = data.quickies || [];
            this.renderQuickies();
        } catch (err) {
            console.error('Failed to load quickies:', err);
            this.quickiesGrid.innerHTML = '<div class="quickies-empty">Failed to load quickies</div>';
        }
    }

    async loadPresets() {
        // Show loading state in UI
        if (this.presetSelect) {
            this.presetSelect.innerHTML = '<option value="">Loading presets...</option>';
            this.presetSelect.disabled = true;
        }

        try {
            const response = await fetch(this.apiUrl('/api/presets'));

            if (!response.ok) {
                const errorText = await response.text();
                this.showPresetError('HTTP ' + response.status + ': ' + errorText);
                return;
            }

            const data = await response.json();

            if (!data || !Array.isArray(data.presets)) {
                this.showPresetError('Invalid response format');
                return;
            }

            this.presets = data.presets;
            this.renderPresetOptions();
        } catch (err) {
            this.showPresetError('Error: ' + (err.message || 'Failed to load'));
        }
    }

    showPresetError(msg) {
        this.presets = [];
        if (this.presetSelect) {
            this.presetSelect.innerHTML = '<option value="">' + msg + '</option>';
            this.presetSelect.disabled = true;
        }
        const warningEl = document.getElementById('quickie-preset-warning');
        if (warningEl) {
            warningEl.textContent = msg;
            warningEl.style.display = 'block';
        }
    }

    renderQuickies() {
        if (!this.quickiesGrid) return;

        if (this.quickies.length === 0) {
            this.quickiesGrid.innerHTML = `
                <div class="quickies-empty">
                    <p>No quickies yet!</p>
                    <p>Click "Manage" to create your first quick launch button.</p>
                </div>
            `;
            return;
        }

        this.quickiesGrid.innerHTML = this.quickies.map(q => `
            <button class="quickie-btn" 
                    data-id="${q.id}" 
                    style="background: linear-gradient(135deg in oklch, ${q.gradientStart}, ${q.gradientEnd})"
                    title="${q.description || q.name}">
                <span class="quickie-emoji">${q.emoji}</span>
                <span class="quickie-name">${q.name}</span>
            </button>
        `).join('');

        // Bind click handlers
        this.quickiesGrid.querySelectorAll('.quickie-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                this.launchQuickie(id);
            });
        });
    }

    renderPresetOptions() {
        if (!this.presetSelect) {
            alert('DEBUG: presetSelect element not found!');
            return;
        }

        if (this.presets.length === 0) {
            this.presetSelect.innerHTML = `
                <option value="">No presets found - create one in New Session first!</option>
            `;
            this.presetSelect.disabled = true;
            const warningEl = document.getElementById('quickie-preset-warning');
            if (warningEl) {
                warningEl.textContent = 'No presets found. Create one via "New Session" button first.';
                warningEl.style.display = 'block';
            }
            return;
        }

        this.presetSelect.disabled = false;
        const warningEl = document.getElementById('quickie-preset-warning');
        if (warningEl) warningEl.style.display = 'none';

        const options = ['<option value="">Select a preset...</option>'];
        for (const p of this.presets) {
            options.push(`<option value="${p.id}">${p.name}</option>`);
        }
        this.presetSelect.innerHTML = options.join('');
    }

    renderQuickiesList() {
        if (!this.quickiesList) return;

        if (this.quickies.length === 0) {
            this.quickiesList.innerHTML = '<p class="quickies-list-empty">No quickies yet. Create one below!</p>';
            return;
        }

        this.quickiesList.innerHTML = this.quickies.map(q => `
            <div class="quickie-list-item" data-id="${q.id}">
                <div class="quickie-list-preview" style="background: linear-gradient(135deg in oklch, ${q.gradientStart}, ${q.gradientEnd})">
                    <span>${q.emoji}</span>
                </div>
                <div class="quickie-list-info">
                    <div class="quickie-list-name">${q.name}</div>
                    <div class="quickie-list-preset">${q.presetName}</div>
                    ${q.starterChunk ? '<span class="quickie-list-badge">auto-send</span>' : ''}
                </div>
                <div class="quickie-list-actions">
                    <button class="btn btn-small btn-secondary quickie-edit" data-id="${q.id}">Edit</button>
                    <button class="btn btn-small btn-danger quickie-delete" data-id="${q.id}">Delete</button>
                </div>
            </div>
        `).join('');

        // Bind handlers
        this.quickiesList.querySelectorAll('.quickie-edit').forEach(btn => {
            btn.addEventListener('click', () => this.editQuickie(btn.dataset.id));
        });
        this.quickiesList.querySelectorAll('.quickie-delete').forEach(btn => {
            btn.addEventListener('click', () => this.deleteQuickie(btn.dataset.id));
        });
    }

    async launchQuickie(id) {
        const quickie = this.quickies.find(q => q.id == id);
        if (!quickie) return;

        // Show loading state
        const btn = this.quickiesGrid.querySelector(`[data-id="${id}"]`);
        if (btn) {
            btn.classList.add('quickie-loading');
            btn.disabled = true;
        }

        try {
            const response = await fetch(this.apiUrl(`/api/quickies/${id}/launch`), {
                method: 'POST'
            });
            const data = await response.json();

            if (data.sessionId) {
                // Switch to session view
                window.location.hash = data.sessionId;
                // Refresh session list in sidebar
                if (window.chat && window.chat.sessionsManager) {
                    window.chat.sessionsManager.loadSessions();
                }
            } else {
                alert('Failed to launch: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Failed to launch quickie:', err);
            alert('Failed to launch quickie');
        } finally {
            if (btn) {
                btn.classList.remove('quickie-loading');
                btn.disabled = false;
            }
        }
    }

    showModal() {
        if (!this.modal) return;
        this.modal.style.display = 'flex';
        this.renderQuickiesList();
        this.loadPresets(); // Refresh presets
        this.resetForm();
    }

    hideModal() {
        if (!this.modal) return;
        this.modal.style.display = 'none';
    }

    resetForm() {
        this.editingId = null;
        this.formTitle.textContent = 'Add Quickie';
        this.form.reset();
        this.idInput.value = '';
        this.updatePreview();
    }

    editQuickie(id) {
        const quickie = this.quickies.find(q => q.id == id);
        if (!quickie) return;

        this.editingId = id;
        this.formTitle.textContent = 'Edit Quickie';
        
        this.idInput.value = id;
        this.presetSelect.value = quickie.presetId;
        this.nameInput.value = quickie.name;
        this.descInput.value = quickie.description || '';
        this.emojiInput.value = quickie.emoji;
        this.gradientStart.value = quickie.gradientStart;
        this.gradientEnd.value = quickie.gradientEnd;
        this.uiMode.value = quickie.uiMode;
        
        if (quickie.starterChunk && quickie.starterChunk.content) {
            this.starterInput.value = quickie.starterChunk.content;
        } else {
            this.starterInput.value = '';
        }
        
        this.updatePreview();
    }

    async deleteQuickie(id) {
        if (!confirm('Are you sure you want to delete this quickie?')) return;

        try {
            const response = await fetch(this.apiUrl(`/api/quickies/${id}`), {
                method: 'DELETE'
            });
            
            if (response.ok) {
                await this.loadQuickies();
                this.renderQuickiesList();
                if (this.editingId == id) {
                    this.resetForm();
                }
            } else {
                alert('Failed to delete quickie');
            }
        } catch (err) {
            console.error('Failed to delete quickie:', err);
            alert('Failed to delete quickie');
        }
    }

    async saveQuickie() {
        const presetId = parseInt(this.presetSelect.value, 10);
        const name = this.nameInput.value.trim();
        const description = this.descInput.value.trim();
        const emoji = this.emojiInput.value.trim();
        const gradientStart = this.gradientStart.value;
        const gradientEnd = this.gradientEnd.value;
        const starterContent = this.starterInput.value.trim();
        const uiMode = this.uiMode.value;

        if (!presetId || !name || !emoji) {
            alert('Please fill in all required fields');
            return;
        }

        const body = {
            presetId,
            name,
            description: description || undefined,
            emoji,
            gradientStart,
            gradientEnd,
            uiMode,
            starterChunk: starterContent ? {
                contentType: 'text',
                content: starterContent,
                annotations: { 'chat.role': 'user' }
            } : null
        };

        try {
            const url = this.editingId 
                ? this.apiUrl(`/api/quickies/${this.editingId}`)
                : this.apiUrl('/api/quickies');
            
            const response = await fetch(url, {
                method: this.editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                await this.loadQuickies();
                this.renderQuickiesList();
                this.resetForm();
                this.hideModal();
            } else {
                const data = await response.json().catch(() => ({}));
                alert('Failed to save: ' + (data.message || data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Failed to save quickie:', err);
            alert('Failed to save quickie');
        }
    }

    // Called by app.js when session changes
    onSessionChange(sessionId) {
        if (sessionId) {
            // Hide quickies view, show messages
            if (this.quickiesView) this.quickiesView.style.display = 'none';
            if (this.messagesEl) this.messagesEl.style.display = 'flex';
            // Show nav button
            if (this.navBtn) this.navBtn.style.display = 'inline-flex';
        } else {
            // Show quickies view, hide messages
            if (this.quickiesView) this.quickiesView.style.display = 'flex';
            if (this.messagesEl) this.messagesEl.style.display = 'none';
            // Hide nav button when already on quickies
            if (this.navBtn) this.navBtn.style.display = 'none';
            this.loadQuickies(); // Refresh quickies
        }
    }

    showQuickies() {
        // Clear session hash to go back to quickies
        if (window.location.hash) {
            history.pushState(null, null, ' ');
        }
        this.onSessionChange(null);
    }
}

// Create global instance
window.quickiesManager = new QuickiesManager();
