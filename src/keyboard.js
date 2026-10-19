/**
 * Inspired by JumpKey & Magma
 */

export class KeyboardEngine {
  constructor(app) {
    this.app = app;
    this.activeCategoryKey = null;
    this.chordTimeout = null;
    this.chordDuration = 2500; // ms to wait for second key in chord
    this.launchDelay = 180; // ms visual feedback before opening URL
    this.hudElement = null;
    this.suggestionsElement = null;
    this.searchFocused = false;
    this.filteredResults = [];
    this.selectedResultIndex = -1;

    this.searchEngines = {
      g: { name: 'Google', bang: ':g', url: 'https://www.google.com/search?q=' },
      d: { name: 'DuckDuckGo', bang: ':d', url: 'https://duckduckgo.com/?q=' },
      ddg: { name: 'DuckDuckGo', bang: ':ddg', url: 'https://duckduckgo.com/?q=' },
      y: { name: 'YouTube', bang: ':y', url: 'https://www.youtube.com/results?search_query=' },
      yt: { name: 'YouTube', bang: ':yt', url: 'https://www.youtube.com/results?search_query=' },
      r: { name: 'Reddit', bang: ':r', url: 'https://www.reddit.com/search/?q=' },
      gh: { name: 'GitHub', bang: ':gh', url: 'https://github.com/search?q=' },
      w: { name: 'Wikipedia', bang: ':w', url: 'https://en.wikipedia.org/w/index.php?search=' },
    };

    this.init();
  }

  init() {
    this.hudElement = document.getElementById('keyboard-hud');
    this.suggestionsElement = document.getElementById('search-suggestions');
    this.bindGlobalEvents();
    this.bindSearchEvents();
  }

  bindGlobalEvents() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  handleKeyDown(e) {
    const activeEl = document.activeElement;
    const isTextInput = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    );

    // Escape closes modals, suggestions, or un-focuses search
    if (e.key === 'Escape') {
      if (this.app.isAnyModalOpen()) {
        e.preventDefault();
        this.app.closeAllModals();
        return;
      }
      if (this.suggestionsElement && !this.suggestionsElement.classList.contains('hidden')) {
        e.preventDefault();
        this.hideSuggestions();
        return;
      }
      if (isTextInput) {
        e.preventDefault();
        activeEl.blur();
        this.hideHud();
        this.resetChord();
        return;
      }
      this.resetChord();
      this.hideHud();
      return;
    }

    // Modal submission via Ctrl+Enter
    if (this.app.isAnyModalOpen()) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.app.submitActiveModal();
      }
      return;
    }

    // If typing in search bar, let search handler manage arrow keys & Enter
    if (isTextInput) {
      return;
    }

    // Global Shortcuts when NOT typing in text inputs:

    // Ctrl+E: Toggle Edit Mode
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      this.app.toggleEditMode();
      this.showHud(this.app.isEditMode ? 'EDIT MODE: ON' : 'EDIT MODE: OFF', 1500);
      return;
    }

    // Plus (+): Quick Add Link
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.app.openAddLinkModal();
      return;
    }

    // Question Mark (?): Help Cheat Sheet
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      this.app.toggleHelpModal();
      return;
    }

    // Space or Slash (/): Focus Omni Search Bar
    if (e.key === ' ' || e.key === '/') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // Ctrl+,: Open Settings
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      this.app.openSettingsModal();
      return;
    }

    // Slide workspace panels: h / l or ArrowLeft / ArrowRight
    if (e.key === 'ArrowLeft' || e.key === 'h') {
      e.preventDefault();
      this.app.navigateCategory(-1);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'l') {
      e.preventDefault();
      this.app.navigateCategory(1);
      return;
    }

    // Backspace: Clear active category chord or return to root
    if (e.key === 'Backspace') {
      if (this.activeCategoryKey) {
        e.preventDefault();
        this.resetChord();
        this.showHud('Root Overview', 1000);
        return;
      }
    }

    // Favorites 1-9, 0 (Digit keys)
    if (/^[0-9]$/.test(e.key)) {
      const digit = parseInt(e.key, 10);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.app.assignFavoritePrompt(digit);
        return;
      }

      const favLink = this.app.getFavoriteLink(digit);
      if (favLink) {
        e.preventDefault();
        this.showHud(`★ [${digit}] Launching ${favLink.name}...`);
        this.launchLink(favLink, e.shiftKey);
        return;
      }
    }

    // Single letters (A-Z) for navigation & chording
    if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const pressedKey = e.key.toUpperCase();

      if (!this.activeCategoryKey) {
        // Step 1: Select Category by key
        const category = this.app.getCategoryByKey(pressedKey);
        if (category) {
          this.activeCategoryKey = pressedKey;
          this.app.switchCategory(category.id);
          this.showHud(`[ ${pressedKey} ] ${category.name} → press link key`);
          this.startChordTimeout();
        } else {
          this.showHud(`Unknown Category [${pressedKey}]`, 1000);
        }
      } else {
        // Step 2: In category -> Select and Launch Link by key
        const currentCat = this.app.getCategoryByKey(this.activeCategoryKey);
        const link = this.app.getLinkByKey(currentCat.id, pressedKey);

        if (link) {
          this.showHud(`[ ${this.activeCategoryKey} → ${pressedKey} ] Launching ${link.name}...`);
          this.flashLinkCard(link.id);
          this.launchLink(link, e.shiftKey);
          this.resetChord();
        } else {
          // Check if pressed key is actually another category key to switch instead
          const altCat = this.app.getCategoryByKey(pressedKey);
          if (altCat) {
            this.activeCategoryKey = pressedKey;
            this.app.switchCategory(altCat.id);
            this.showHud(`[ ${pressedKey} ] ${altCat.name} → press link key`);
            this.startChordTimeout();
          } else {
            this.showHud(`[ ${this.activeCategoryKey} → ${pressedKey} ] Not found`, 1200);
            this.resetChord();
          }
        }
      }
    }
  }

  startChordTimeout() {
    clearTimeout(this.chordTimeout);
    this.chordTimeout = setTimeout(() => {
      this.resetChord();
      this.hideHud();
    }, this.chordDuration);
  }

  resetChord() {
    clearTimeout(this.chordTimeout);
    this.activeCategoryKey = null;
  }

