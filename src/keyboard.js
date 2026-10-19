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

  bindSearchEvents() {
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');

    if (!searchInput) return;

    searchInput.addEventListener('focus', () => {
      this.searchFocused = true;
      if (searchInput.value.trim()) {
        this.handleSearchInput(searchInput.value);
      }
    });

    searchInput.addEventListener('blur', () => {
      this.searchFocused = false;
      // Delay hide to allow clicks on suggestion items
      setTimeout(() => this.hideSuggestions(), 250);
    });

    searchInput.addEventListener('input', () => {
      const query = searchInput.value;
      this.handleSearchInput(query);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (this.suggestionsElement && !this.suggestionsElement.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateSuggestions(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateSuggestions(-1);
          return;
        }
        if (e.key === 'Enter' && this.selectedResultIndex >= 0) {
          e.preventDefault();
          const selected = this.filteredResults[this.selectedResultIndex];
          if (selected) {
            if (selected.type === 'engine') {
              this.app.setSearchEngine(selected.name, selected.url);
              searchInput.value = '';
              this.hideSuggestions();
            } else if (selected.type === 'link') {
              this.launchLink(selected.link, e.shiftKey);
              this.hideSuggestions();
            }
            return;
          }
        }
      }

      if (e.key === 'Escape') {
        this.hideSuggestions();
        searchInput.blur();
      }
    });

    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.executeSearch(searchInput.value.trim(), e.shiftKey);
      });
    }
  }

  handleSearchInput(rawQuery) {
    const query = rawQuery.trim();
    if (!query) {
      this.hideSuggestions();
      return;
    }

    this.filteredResults = [];
    this.selectedResultIndex = -1;

    // Mode A: Search bangs (starts with :)
    if (query.startsWith(':')) {
      const bangQuery = query.slice(1).toLowerCase();
      const matchingBangs = Object.entries(this.searchEngines)
        .filter(([key, eng]) => key.startsWith(bangQuery) || eng.name.toLowerCase().includes(bangQuery))
        .map(([key, eng]) => ({
          type: 'engine',
          key,
          name: eng.name,
          bang: `:${key}`,
          url: eng.url
        }));

      this.filteredResults = matchingBangs;
      this.renderSuggestions(this.filteredResults, 'engine');
      return;
    }

    // Mode B: Link search across all categories
    const matchingLinks = this.app.searchAllLinks(query);
    this.filteredResults = matchingLinks.map(l => ({
      type: 'link',
      link: l,
      title: l.name,
      url: l.url,
      catName: l.categoryName || '',
      key: l.key
    }));

    if (this.filteredResults.length > 0) {
      this.renderSuggestions(this.filteredResults, 'link');
    } else {
      this.hideSuggestions();
    }
  }

  renderSuggestions(items, mode) {
    if (!this.suggestionsElement) return;

    if (items.length === 0) {
      this.hideSuggestions();
      return;
    }

    let html = '';
    if (mode === 'engine') {
      html = items.slice(0, 5).map((item, idx) => `
        <div class="m3-menu-item suggestion-item ${idx === this.selectedResultIndex ? 'selected' : ''}" data-index="${idx}">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-[var(--md-sys-color-primary)]">travel_explore</span>
            <span class="font-semibold">${item.name} Search</span>
          </div>
          <span class="m3-key-badge text-[10px]">${item.bang}</span>
        </div>
      `).join('');
    } else {
      html = items.slice(0, 6).map((item, idx) => `
        <div class="m3-menu-item suggestion-item ${idx === this.selectedResultIndex ? 'selected' : ''}" data-index="${idx}">
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="material-symbols-outlined text-[16px] text-[var(--md-sys-color-primary)]">bookmark</span>
            <div class="flex flex-col truncate">
              <span class="font-semibold truncate">${item.title}</span>
              <span class="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">${item.url}</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${item.catName ? `<span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-outline)] font-bold">${item.catName}</span>` : ''}
            <span class="m3-key-badge text-[10px]">${item.key}</span>
          </div>
        </div>
      `).join('');
    }

    this.suggestionsElement.innerHTML = html;
    clearTimeout(this.closeTimer);
    this.suggestionsElement.classList.remove('closing', 'hidden');

    // Add click listeners to items
    this.suggestionsElement.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        const item = this.filteredResults[idx];
        if (item) {
          if (item.type === 'engine') {
            this.app.setSearchEngine(item.name, item.url);
            document.getElementById('search-input').value = '';
          } else if (item.type === 'link') {
            this.launchLink(item.link);
          }
          this.hideSuggestions();
        }
      });
    });
  }

  navigateSuggestions(direction) {
    if (this.filteredResults.length === 0) return;
    this.selectedResultIndex = (this.selectedResultIndex + direction + this.filteredResults.length) % this.filteredResults.length;
    this.renderSuggestions(this.filteredResults, this.filteredResults[0].type);
  }

  hideSuggestions() {
    const el = this.suggestionsElement;
    if (!el) return;
    this.filteredResults = [];
    this.selectedResultIndex = -1;
    if (el.classList.contains("hidden") || el.classList.contains("closing")) return;
    el.classList.add("closing");
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      el.classList.remove("closing");
      el.classList.add("hidden");
    }, 160);
  }

  executeSearch(rawQuery, openInCurrentTab = false) {
    if (!rawQuery) return;

    let query = rawQuery;
    let engineUrl = this.app.getCurrentEngineUrl();

    // Check for inline bang (e.g., ":yt lo-fi beats")
    const bangMatch = query.match(/^:([a-zA-Z]+)\s*(.*)$/);
    if (bangMatch) {
      const bang = bangMatch[1].toLowerCase();
      if (this.searchEngines[bang]) {
        engineUrl = this.searchEngines[bang].url;
        query = bangMatch[2].trim();
      }
    }

    if (!query) return;

    const finalUrl = engineUrl + encodeURIComponent(query);
    if (openInCurrentTab) {
      window.location.href = finalUrl;
    } else {
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
    }
  }

  launchLink(link, openInCurrentTab = false) {
    setTimeout(() => {
      if (openInCurrentTab) {
        window.location.href = link.url;
      } else {
        window.open(link.url, '_blank', 'noopener,noreferrer');
      }
      this.hideHud();
    }, this.launchDelay);
  }

  flashLinkCard(linkId) {
    const card = document.querySelector(`[data-link-id="${linkId}"]`);
    if (card) {
      card.classList.add('launching');
      setTimeout(() => card.classList.remove('launching'), 400);
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

  showHud(text, autoHideMs = 0) {
    if (!this.hudElement) return;
    this.hudElement.textContent = text;
    this.hudElement.classList.add('visible');

    if (autoHideMs > 0) {
      clearTimeout(this.hudTimeout);
      this.hudTimeout = setTimeout(() => {
        this.hideHud();
      }, autoHideMs);
    }
  }

  hideHud() {
    if (!this.hudElement) return;
    this.hudElement.classList.remove('visible');
  }
}
