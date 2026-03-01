export class ThemeManager {
    constructor() {
        this.themeToggleBtn = null;
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
    }

    bindElements() {
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
            this.updateToggleIcon();
        }
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        this.currentTheme = theme;
        this.updateToggleIcon();
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
    }

    updateToggleIcon() {
        if (this.themeToggleBtn) {
            this.themeToggleBtn.textContent = this.currentTheme === 'light' ? '🌙' : '☀️';
            this.themeToggleBtn.title = this.currentTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
        }
    }
}
