import { KeyboardEngine } from './keyboard.js';

// === STATE & DATA ===
let categories = [
  { id: "category1", name: "Social", key: "S" },
  { id: "category2", name: "Study", key: "T" },
  { id: "category3", name: "Development", key: "D" },
];

let links = [
  { id: "1", name: "Reddit", url: "https://reddit.com", categoryId: "category1", key: "R", favorite: 1 },
  { id: "2", name: "Facebook", url: "https://facebook.com", categoryId: "category1", key: "F" },
  { id: "3", name: "TikTok", url: "https://tiktok.com", categoryId: "category1", key: "T" },
  { id: "4", name: "YouTube", url: "https://youtube.com", categoryId: "category1", key: "Y", favorite: 2 },
  { id: "5", name: "Pinterest", url: "https://pinterest.com", categoryId: "category1", key: "P" },

  { id: "6", name: "NotebookLM", url: "https://notebooklm.google.com", categoryId: "category2", key: "N", favorite: 3 },
  { id: "7", name: "eLms", url: "https://elms.sti.edu", categoryId: "category2", key: "E" },
  { id: "8", name: "Google Drive", url: "https://drive.google.com", categoryId: "category2", key: "G", favorite: 4 },

  { id: "9", name: "GitHub", url: "https://github.com", categoryId: "category3", key: "G", favorite: 5 },
  { id: "10", name: "Codeberg", url: "https://codeberg.org", categoryId: "category3", key: "C" },
];

let settings = {
  theme: "lavender",
  amoled: false,
  showFavorites: true,
  keyboardDriven: true,
  lastActiveCategoryId: "category1",
  lastEngine: "https://www.google.com/search?q=",
};
const SETTING_KEYS = Object.keys(settings);

let currentCategoryId = "category1";
let isEditMode = false;
let pendingDelete = { type: null, id: null };
let isProgrammaticScroll = false;

let keyboardEngine = null;

// === HELPERS ===
function generateId() {
  return Date.now().toString();
}

function normalizeKey(str, takenKeys = new Set()) {
  if (!str) return null;
  const clean = str.toUpperCase().replace(/[^A-Z]/g, '');
  for (const char of clean) {
    if (!takenKeys.has(char)) return char;
  }
  for (let i = 65; i <= 90; i++) {
    const char = String.fromCharCode(i);
    if (!takenKeys.has(char)) return char;
  }
  return 'X';
}

function ensureKeys() {
  const catKeys = new Set();
  categories.forEach(cat => {
    if (cat.key && !catKeys.has(cat.key.toUpperCase())) {
      cat.key = cat.key.toUpperCase();
      catKeys.add(cat.key);
    } else {
      cat.key = normalizeKey(cat.name, catKeys);
      catKeys.add(cat.key);
    }
  });

  categories.forEach(cat => {
    const linkKeys = new Set();
    links.filter(l => l.categoryId === cat.id).forEach(l => {
      if (l.key && !linkKeys.has(l.key.toUpperCase())) {
        l.key = l.key.toUpperCase();
        linkKeys.add(l.key);
      } else {
        l.key = normalizeKey(l.name, linkKeys);
        linkKeys.add(l.key);
      }
    });
  });
}

// read a key, falling back to a legacy name; copy to the new name and drop the legacy one
function readMigratedKey(primary, legacy) {
  const value = localStorage.getItem(primary);
  if (value !== null) return value;
  const old = localStorage.getItem(legacy);
  if (old !== null) {
    localStorage.setItem(primary, old);
    localStorage.removeItem(legacy);
  }
  return old;
}

function saveSettings() {
  settings.lastActiveCategoryId = currentCategoryId;
  localStorage.setItem("nuwii_settings", JSON.stringify(settings));
}

function pruneSettings(raw) {
  const out = {};
  SETTING_KEYS.forEach(k => { if (raw[k] !== undefined) out[k] = raw[k]; });
  return out;
}

function loadSettings() {
  const saved = readMigratedKey("nuwii_settings", "nodezero_settings");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const merged = pruneSettings({ ...settings, ...parsed });
      // migrate old widget config: visibleWidgets.favorites -> showFavorites
      if (parsed.showFavorites === undefined && parsed.visibleWidgets) {
        merged.showFavorites = parsed.visibleWidgets.favorites === true;
      }
      settings = merged;
      if (settings.lastActiveCategoryId && categories.some(c => c.id === settings.lastActiveCategoryId)) {
        currentCategoryId = settings.lastActiveCategoryId;
      }
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }
  applySettings();
}

// single write path for every live setting change
function patchSettings(patch, opts = {}) {
  settings = pruneSettings({ ...settings, ...patch });
  saveSettings();
  applySettings();
  if (opts.favorites) renderFavoritesStrip();
}

function saveData() {
  localStorage.setItem("nuwii_categories", JSON.stringify(categories));
  localStorage.setItem("nuwii_links", JSON.stringify(links));
}

function loadData() {
  const savedCat = readMigratedKey("nuwii_categories", "nodezero_categories") || localStorage.getItem("categories");
  const savedLinks = readMigratedKey("nuwii_links", "nodezero_links") || localStorage.getItem("links");

  if (savedCat) {
    try { categories = JSON.parse(savedCat); } catch (e) { console.error(e); }
  }
  if (savedLinks) {
    try { links = JSON.parse(savedLinks); } catch (e) { console.error(e); }
  }

  ensureKeys();

  if (categories.length > 0 && !categories.find((c) => c.id === currentCategoryId)) {
    currentCategoryId = categories[0].id;
  }
}

// === SERVICE ICONS ===
function faviconUrl(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return null;
  }
}

// normalized tile: favicon over a letter chip, never a globe
function serviceIcon(link, tile = 32) {
  const letter = (link.name || "?").trim().charAt(0).toUpperCase() || "?";
  const fav = faviconUrl(link.url);
  return `<span class="m3-icon-tile" style="--tile:${tile}px"><span class="m3-icon-letter">${letter}</span>${
    fav ? `<img class="m3-icon-img" src="${fav}" alt="" onerror="this.remove()">` : ""
  }</span>`;
}

// === APPLY SETTINGS ===
function applySettings() {
  document.documentElement.dataset.theme = settings.theme || "lavender";
  document.documentElement.dataset.amoled = settings.amoled ? "true" : "false";
  document.documentElement.dataset.kb = settings.keyboardDriven === false ? "off" : "on";
}

// === RENDERING ENGINE ===
function render() {
  renderFavoritesStrip();
  renderCategoryTabs();
  renderWorkspace();
}

function renderFavoritesStrip() {
  const strip = document.getElementById("favorites-strip");
  if (!strip) return;

  if (settings.showFavorites !== true) {
    strip.innerHTML = "";
    strip.classList.add("hidden");
    return;
  }

  const favLinks = links
    .filter(l => l.favorite !== undefined && l.favorite !== null && l.favorite >= 0 && l.favorite <= 9)
    .sort((a, b) => a.favorite - b.favorite);

  if (favLinks.length === 0) {
    strip.innerHTML = "";
    strip.classList.add("hidden");
    return;
  }

  strip.classList.remove("hidden");
  strip.innerHTML = favLinks.map(l => `
    <a href="${l.url}" target="_blank" rel="noopener noreferrer" class="m3-fav-grid" title="Press '${l.favorite}' to launch">
      <span class="m3-key-badge text-[9px] px-1 py-0.5">${l.favorite}</span>
      ${serviceIcon(l, 24)}
      <span class="truncate min-w-0">${l.name}</span>
    </a>
  `).join("");
}

function renderCategoryTabs() {
  const tabsContainer = document.getElementById("category-tabs");
  if (!tabsContainer) return;

  let tabsHtml = categories.map((cat) => {
    const isActive = currentCategoryId === cat.id;
    return `
      <div class="relative shrink-0 flex items-center">
        <button class="m3-tab-chip ${isActive ? "active" : ""}" data-id="${cat.id}" title="Press '${cat.key}' or click to navigate">
          <span>${cat.name}</span>
          <span class="m3-key-badge">${cat.key}</span>
        </button>
        ${isEditMode ? `<button class="cat-delete-btn absolute -top-1.5 -right-1.5 w-5 h-5 rounded-diag bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)] text-[10px] font-bold flex items-center justify-center hover:scale-110 transition z-10 cursor-pointer" data-id="${cat.id}" title="Delete category">✕</button>` : ""}
      </div>
    `;
  }).join("");

  if (isEditMode) {
    tabsHtml += `
      <button id="add-cat-btn" class="h-10 px-4 rounded-diag bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-primary)] text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer shrink-0">
        <span class="material-symbols-outlined text-[16px]">add</span>
        <span>Category</span>
      </button>
    `;
  }

  tabsContainer.innerHTML = tabsHtml;

  tabsContainer.querySelectorAll(".m3-tab-chip").forEach((btn) => {
    btn.addEventListener("click", () => scrollToCategory(btn.dataset.id));
  });

  if (isEditMode) {
    document.getElementById("add-cat-btn")?.addEventListener("click", openAddCatModal);
    tabsContainer.querySelectorAll(".cat-delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        pendingDelete = { type: "cat", id: btn.dataset.id };
        const cat = categories.find(c => c.id === btn.dataset.id);
        document.getElementById("delete-modal-msg").textContent = `Delete category "${cat?.name}" and all its bookmarks?`;
        document.getElementById("delete-modal").classList.remove("hidden");
      });
    });
  }
}

// === WORKSPACE STRIP ===
function renderWorkspace() {
  const container = document.getElementById("workspace-container");
  if (!container) return;

  container.innerHTML = `
    <div id="workstrip" class="workstrip hide-scrollbar">
      ${categories.map((cat) => {
        const catLinks = links.filter(l => l.categoryId === cat.id);
        const isActive = currentCategoryId === cat.id;
        return `
          <div class="workstrip-panel ${isActive ? 'active' : ''}" data-cat-id="${cat.id}">
            <div class="flex items-center justify-between px-1 pb-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm tracking-tight text-[var(--md-sys-color-on-surface)]">${cat.name}</span>
                <span class="m3-key-badge">${cat.key}</span>
              </div>
              <span class="text-[11px] font-bold text-[var(--md-sys-color-outline)]">${catLinks.length} items</span>
            </div>

            <div class="flex flex-col gap-2.5">
              ${catLinks.length === 0 && !isEditMode ? `
                <div class="py-8 text-center text-xs text-[var(--md-sys-color-outline)]">No links in this workspace</div>
              ` : catLinks.map((l, i) => renderCardHtml(l, i, catLinks.length)).join("")}

              ${isEditMode ? `
                <button class="column-add-link-btn h-12 w-full rounded-diag bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-primary)] flex items-center justify-center gap-1.5 hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer text-xs font-semibold" data-cat-id="${cat.id}">
                  <span class="material-symbols-outlined text-[18px]">add</span>
                  <span>Add Link</span>
                </button>
              ` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  bindCardListeners(container);
  bindStripEvents();
}

function renderCardHtml(link, idx, total) {
  const moveBtns = isEditMode ? `
          <button class="link-move w-5 h-5 rounded-diag bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-center hover:bg-[var(--md-sys-color-surface-container)] transition disabled:opacity-30 cursor-pointer" data-id="${link.id}" data-dir="-1" ${idx === 0 ? "disabled" : ""} title="Move up"><span class="material-symbols-outlined text-[14px]">keyboard_arrow_up</span></button>
          <button class="link-move w-5 h-5 rounded-diag bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-center hover:bg-[var(--md-sys-color-surface-container)] transition disabled:opacity-30 cursor-pointer" data-id="${link.id}" data-dir="1" ${idx === total - 1 ? "disabled" : ""} title="Move down"><span class="material-symbols-outlined text-[14px]">keyboard_arrow_down</span></button>` : "";

  return `
    <div class="relative w-full">
      <a href="${link.url}" target="_blank" rel="noopener noreferrer"
        class="m3-service-card group ${isEditMode ? 'cursor-pointer' : ''}"
        data-link-id="${link.id}"
        title="${isEditMode ? 'Click to edit bookmark' : `Press '${link.key}' to launch`}">
        <div class="flex items-center gap-3 overflow-hidden">
          ${serviceIcon(link, 32)}
          <div class="flex flex-col overflow-hidden text-left">
            <span class="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate group-hover:text-[var(--md-sys-color-primary)] transition-colors">${link.name}</span>
            ${link.favorite !== undefined && link.favorite !== null ? `<span class="m3-fav-tag mt-0.5">★ ${link.favorite}</span>` : ""}
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          ${moveBtns}
          ${isEditMode ? `<span class="material-symbols-outlined text-[16px] text-[var(--md-sys-color-primary)]">edit</span>` : ''}
          <span class="m3-key-badge">${link.key}</span>
        </div>
      </a>

      ${isEditMode ? `<button class="link-delete-btn absolute -top-1.5 -right-1.5 w-5 h-5 rounded-diag bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)] text-[10px] font-bold flex items-center justify-center hover:scale-110 transition z-10 cursor-pointer" data-id="${link.id}" title="Delete bookmark">✕</button>` : ""}
    </div>
  `;
}

function bindCardListeners(parentEl) {
  if (!isEditMode) return;

  parentEl.querySelectorAll(".m3-service-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      openEditLinkModal(card.dataset.linkId);
    });
  });

  parentEl.querySelectorAll(".link-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pendingDelete = { type: "link", id: btn.dataset.id };
      const link = links.find(l => l.id === btn.dataset.id);
      document.getElementById("delete-modal-msg").textContent = `Delete bookmark "${link?.name}"?`;
      document.getElementById("delete-modal").classList.remove("hidden");
    });
  });

  parentEl.querySelectorAll(".link-move").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      moveLink(btn.dataset.id, parseInt(btn.dataset.dir, 10));
    });
  });

  parentEl.querySelectorAll(".column-add-link-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentCategoryId = btn.dataset.catId;
      openAddLinkModal();
    });
  });
}

function moveLink(id, dir) {
  const link = links.find(l => l.id === id);
  if (!link) return;
  const siblings = links.filter(l => l.categoryId === link.categoryId);
  const i = siblings.indexOf(link);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  const ai = links.indexOf(link);
  const bi = links.indexOf(siblings[j]);
  [links[ai], links[bi]] = [links[bi], links[ai]];
  saveData();
  render();
  scrollToCategory(currentCategoryId);
}

function bindStripEvents() {
  const strip = document.getElementById("workstrip");
  if (!strip) return;

  strip.addEventListener("wheel", (e) => {
    // only capture the wheel over a card; side padding keeps page vertical scroll
    if (!e.target.closest(".workstrip-panel")) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  let scrollDebounce = null;
  strip.addEventListener("scroll", () => {
    if (isProgrammaticScroll) return;
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      const stripRect = strip.getBoundingClientRect();
      const stripCenter = stripRect.left + stripRect.width / 2;

      let closestCatId = null;
      let minDistance = Infinity;

      strip.querySelectorAll(".workstrip-panel").forEach(col => {
        const colRect = col.getBoundingClientRect();
        const dist = Math.abs(stripCenter - (colRect.left + colRect.width / 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestCatId = col.dataset.catId;
        }
      });

      if (closestCatId && closestCatId !== currentCategoryId) {
        currentCategoryId = closestCatId;
        saveSettings();
        strip.querySelectorAll(".workstrip-panel").forEach(col => {
          col.classList.toggle("active", col.dataset.catId === currentCategoryId);
        });
        document.querySelectorAll("#category-tabs .m3-tab-chip").forEach(tab => {
          tab.classList.toggle("active", tab.dataset.id === currentCategoryId);
        });
      }
    }, 120);
  });
}

// center the strip on a category panel
function scrollToCategory(catId) {
  currentCategoryId = catId;
  saveSettings();

  const strip = document.getElementById("workstrip");
  const targetCol = strip?.querySelector(`[data-cat-id="${catId}"]`);
  if (!targetCol) {
    render();
    return;
  }

  isProgrammaticScroll = true;
  targetCol.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  setTimeout(() => { isProgrammaticScroll = false; }, 400);

  strip.querySelectorAll(".workstrip-panel").forEach(col => {
    col.classList.toggle("active", col.dataset.catId === catId);
  });
  document.querySelectorAll("#category-tabs .m3-tab-chip").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.id === catId);
  });
}

// slide left/right across workspace panels
function navigateCategory(direction) {
  const currentIndex = categories.findIndex(c => c.id === currentCategoryId);
  if (currentIndex === -1) return;

  const nextIndex = (currentIndex + direction + categories.length) % categories.length;
  const nextCat = categories[nextIndex];
  if (nextCat) {
    scrollToCategory(nextCat.id);
    keyboardEngine?.showHud(`[ ${nextCat.key} ] ${nextCat.name}`, 800);
  }
}

// === EDIT MODE ===
function toggleEditMode() {
  isEditMode = !isEditMode;
  render();

  const editBtn = document.getElementById("edit-btn");
  const editDot = document.getElementById("edit-dot");
  if (editBtn && editDot) {
    if (isEditMode) {
      editBtn.setAttribute("aria-checked", "true");
      editBtn.classList.add("bg-[var(--md-sys-color-primary-container)]", "text-[var(--md-sys-color-on-primary-container)]");
      editDot.classList.replace("bg-[var(--md-sys-color-outline)]", "bg-[var(--md-sys-color-primary)]");
    } else {
      editBtn.setAttribute("aria-checked", "false");
      editBtn.classList.remove("bg-[var(--md-sys-color-primary-container)]", "text-[var(--md-sys-color-on-primary-container)]");
      editDot.classList.replace("bg-[var(--md-sys-color-primary)]", "bg-[var(--md-sys-color-outline)]");
    }
  }
}

// === MODALS ===
function isAnyModalOpen() {
  return ['settings-modal', 'help-modal', 'add-modal', 'add-cat-modal', 'edit-link-modal', 'config-modal', 'delete-modal']
    .some(id => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
}

function closeAllModals() {
  ['settings-modal', 'help-modal', 'add-modal', 'add-cat-modal', 'edit-link-modal', 'config-modal', 'delete-modal']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

function submitActiveModal() {
  if (!document.getElementById('settings-modal')?.classList.contains('hidden')) {
    closeAllModals();
  } else if (!document.getElementById('add-modal')?.classList.contains('hidden')) {
    saveNewLink();
  } else if (!document.getElementById('edit-link-modal')?.classList.contains('hidden')) {
    saveEditLink();
  } else if (!document.getElementById('add-cat-modal')?.classList.contains('hidden')) {
    saveNewCategory();
  } else if (!document.getElementById('config-modal')?.classList.contains('hidden')) {
    const text = document.getElementById('config-text')?.value;
    if (text?.trim()) importConfig(text);
  } else if (!document.getElementById('delete-modal')?.classList.contains('hidden')) {
    document.getElementById('confirm-delete-btn')?.click();
  } else {
    closeAllModals();
  }
}

function toggleHelpModal() {
  document.getElementById("help-modal")?.classList.toggle("hidden");
}

// === SETTINGS MODAL ===
function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  syncSettingsControls();
  modal.classList.remove("hidden");
}

function syncSettingsControls() {
  document.querySelector('[data-opt="amoled"]')?.setAttribute("aria-checked", settings.amoled ? "true" : "false");
  document.querySelector('[data-opt="keyboardDriven"]')?.setAttribute("aria-checked", settings.keyboardDriven !== false ? "true" : "false");
  document.querySelector('[data-switch="favorites"]')?.setAttribute("aria-checked", settings.showFavorites === true ? "true" : "false");

  document.querySelectorAll(".theme-choice-btn").forEach(b => {
    const on = b.dataset.theme === settings.theme;
    b.classList.toggle("bg-[var(--md-sys-color-primary-container)]", on);
    b.classList.toggle("text-[var(--md-sys-color-on-primary-container)]", on);
  });
}

// === CONFIGURATION MODAL ===
function currentConfig() {
  return { version: "2.0", exportDate: new Date().toISOString(), settings, categories, links };
}

function openConfigModal() {
  const modal = document.getElementById("config-modal");
  if (!modal) return;
  const favCount = links.filter(l => l.favorite !== undefined && l.favorite !== null).length;
  document.getElementById("config-stats").innerHTML = `
    <div class="m3-stat"><span class="m3-stat-num">${categories.length}</span><span class="m3-stat-label">Categories</span></div>
    <div class="m3-stat"><span class="m3-stat-num">${links.length}</span><span class="m3-stat-label">Bookmarks</span></div>
    <div class="m3-stat"><span class="m3-stat-num">${favCount}</span><span class="m3-stat-label">Favorites</span></div>`;
  document.getElementById("config-text").value = "";
  modal.classList.remove("hidden");
}

function downloadConfig() {
  const blob = new Blob([JSON.stringify(currentConfig(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nuwii.config.json";
  a.click();
  URL.revokeObjectURL(url);
  keyboardEngine?.showHud("Config downloaded", 1500);
}

async function copyConfig() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(currentConfig(), null, 2));
    keyboardEngine?.showHud("Config copied", 1500);
  } catch {
    keyboardEngine?.showHud("Copy blocked by browser", 1500);
  }
}

function importConfig(text) {
  try {
    const parsed = JSON.parse(String(text).trim());
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.links)) {
      throw new Error("categories and links arrays required");
    }
    categories = parsed.categories;
    links = parsed.links;
    if (parsed.settings) {
      const incoming = pruneSettings({ ...settings, ...parsed.settings });
      if (parsed.settings.showFavorites === undefined && parsed.settings.visibleWidgets) {
        incoming.showFavorites = parsed.settings.visibleWidgets.favorites === true;
      }
      settings = incoming;
    }
    ensureKeys();
    currentCategoryId = categories[0]?.id || "category1";
    saveData();
    saveSettings();
    applySettings();
    render();
    closeAllModals();
    keyboardEngine?.showHud("Configuration restored", 2000);
  } catch (err) {
    keyboardEngine?.showHud("Import failed: " + err.message, 2500);
  }
}

function importConfigFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importConfig(reader.result);
  reader.onerror = () => keyboardEngine?.showHud("Could not read file", 2000);
  reader.readAsText(file);
}

// === LINK / CATEGORY MODALS ===
function openAddLinkModal() {
  const modal = document.getElementById("add-modal");
  document.getElementById("link-name").value = "";
  document.getElementById("link-url").value = "";
  document.getElementById("link-key").value = "";
  document.getElementById("link-fav").value = "";
  modal.classList.remove("hidden");
  document.getElementById("link-name").focus();
}

function openEditLinkModal(linkId) {
  const link = links.find(l => l.id === linkId);
  if (!link) return;

  document.getElementById("edit-link-id").value = link.id;
  document.getElementById("edit-link-name").value = link.name;
  document.getElementById("edit-link-url").value = link.url;
  document.getElementById("edit-link-key").value = link.key || "";
  document.getElementById("edit-link-fav").value = link.favorite !== undefined ? link.favorite : "";

  document.getElementById("edit-link-modal").classList.remove("hidden");
  document.getElementById("edit-link-name").focus();
}

function saveEditLink() {
  const id = document.getElementById("edit-link-id").value;
  const name = document.getElementById("edit-link-name").value.trim();
  let url = document.getElementById("edit-link-url").value.trim();
  let key = document.getElementById("edit-link-key").value.trim().toUpperCase();
  const favVal = document.getElementById("edit-link-fav").value.trim();

  if (!name || !url) return keyboardEngine?.showHud("Fill in name and URL", 1800);
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;

  const link = links.find(l => l.id === id);
  if (!link) return;

  const existingKeys = new Set(links.filter(l => l.categoryId === link.categoryId && l.id !== id).map(l => l.key));
  if (!key || existingKeys.has(key)) key = normalizeKey(name, existingKeys);

  link.name = name;
  link.url = url;
  link.key = key;
  link.favorite = favVal ? parseInt(favVal, 10) : undefined;

  saveData();
  render();
  closeAllModals();
  keyboardEngine?.showHud(`Updated ${name} [${key}]`, 1200);
}

function openAddCatModal() {
  const modal = document.getElementById("add-cat-modal");
  document.getElementById("category-name").value = "";
  document.getElementById("category-key").value = "";
  modal.classList.remove("hidden");
  document.getElementById("category-name").focus();
}

function saveNewLink() {
  const name = document.getElementById("link-name").value.trim();
  let url = document.getElementById("link-url").value.trim();
  let key = document.getElementById("link-key").value.trim().toUpperCase();
  const favVal = document.getElementById("link-fav").value.trim();

  if (!name || !url) return keyboardEngine?.showHud("Fill in name and URL", 1800);
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;

  const existingKeys = new Set(links.filter(l => l.categoryId === currentCategoryId).map(l => l.key));
  if (!key || existingKeys.has(key)) key = normalizeKey(name, existingKeys);

  links.push({ id: generateId(), name, url, categoryId: currentCategoryId, key, favorite: favVal ? parseInt(favVal, 10) : undefined });
  saveData();
  render();
  closeAllModals();
  keyboardEngine?.showHud(`Saved ${name} [${key}]`, 1200);
}

function saveNewCategory() {
  const name = document.getElementById("category-name").value.trim();
  let key = document.getElementById("category-key").value.trim().toUpperCase();

  if (!name) return keyboardEngine?.showHud("Enter a category name", 1800);

  const existingKeys = new Set(categories.map(c => c.key));
  if (!key || existingKeys.has(key)) key = normalizeKey(name, existingKeys);

  const newId = generateId();
  categories.push({ id: newId, name, key });
  currentCategoryId = newId;
  saveData();
  render();
  closeAllModals();
  scrollToCategory(newId);
  keyboardEngine?.showHud(`Created ${name} [${key}]`, 1200);
}

// === SEARCH ENGINE CONTROLS ===
const searchEngineValue = document.getElementById("search-engine-value");
const selectedEngineText = document.getElementById("selected-engine-text");
const dropdownBtn = document.getElementById("dropdown-btn");
const dropdownMenu = document.getElementById("dropdown-menu");

function setSearchEngine(name, url) {
  if (selectedEngineText) selectedEngineText.textContent = name;
  if (searchEngineValue) searchEngineValue.value = url;
  document.querySelectorAll(".engine-option").forEach(opt => {
    opt.classList.toggle("selected", opt.dataset.name === name);
  });
  patchSettings({ lastEngine: url });
}

function getCurrentEngineUrl() {
  return searchEngineValue?.value || "https://www.google.com/search?q=";
}

// === EVENT LISTENERS ===
document.getElementById("settings-btn")?.addEventListener("click", openSettingsModal);
document.getElementById("close-settings-btn")?.addEventListener("click", closeAllModals);
document.getElementById("config-btn")?.addEventListener("click", openConfigModal);
document.getElementById("close-config-btn")?.addEventListener("click", closeAllModals);

document.getElementById("help-btn")?.addEventListener("click", toggleHelpModal);
document.getElementById("close-help-btn")?.addEventListener("click", toggleHelpModal);
document.getElementById("got-it-btn")?.addEventListener("click", toggleHelpModal);
document.getElementById("edit-btn")?.addEventListener("click", toggleEditMode);

// header pill — slide out, retract on item click / outside click
const pillMenu = document.getElementById("pill-menu");
const pillToggle = document.getElementById("pill-toggle");
function setHeaderPill(open) {
  if (!pillMenu) return;
  if (open) {
    // measure so long menus never clip (adds 12px side padding when open)
    pillMenu.style.maxWidth = (pillMenu.scrollWidth + 12) + "px";
    pillMenu.classList.add("open");
  } else {
    pillMenu.classList.remove("open");
    pillMenu.style.maxWidth = "0px";
  }
  pillToggle?.setAttribute("aria-expanded", open ? "true" : "false");
}
pillToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  setHeaderPill(!pillMenu.classList.contains("open"));
});
document.addEventListener("click", (e) => {
  if (pillMenu && !pillMenu.contains(e.target) && e.target !== pillToggle) setHeaderPill(false);
});

document.getElementById("cancel-modal")?.addEventListener("click", closeAllModals);
document.getElementById("save-modal")?.addEventListener("click", saveNewLink);
document.getElementById("cancel-cat-modal")?.addEventListener("click", closeAllModals);
document.getElementById("save-cat-modal")?.addEventListener("click", saveNewCategory);
document.getElementById("cancel-edit-link-btn")?.addEventListener("click", closeAllModals);
document.getElementById("save-edit-link-btn")?.addEventListener("click", saveEditLink);

document.getElementById("cancel-delete-btn")?.addEventListener("click", closeAllModals);
document.getElementById("confirm-delete-btn")?.addEventListener("click", () => {
  if (pendingDelete.type === "link") {
    links = links.filter((l) => l.id !== pendingDelete.id);
  } else if (pendingDelete.type === "cat") {
    categories = categories.filter((c) => c.id !== pendingDelete.id);
    links = links.filter((l) => l.categoryId !== pendingDelete.id);
    if (currentCategoryId === pendingDelete.id) currentCategoryId = categories[0]?.id || null;
  }
  saveData();
  render();
  closeAllModals();
});

// theme buttons — live preview + persist
document.querySelectorAll(".theme-choice-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    patchSettings({ theme: btn.dataset.theme });
    syncSettingsControls();
  });
});

// toggles — amoled + launch strip (delegated)
document.addEventListener("click", (e) => {
  const sw = e.target.closest(".m3-switch");
  if (sw) {
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", on ? "true" : "false");
    const opt = sw.dataset.opt;
    if (opt) patchSettings({ [opt]: on });
    else if (sw.dataset.switch === "favorites") patchSettings({ showFavorites: on }, { favorites: true });
  }
});

// configuration — export / import
document.getElementById("config-download")?.addEventListener("click", downloadConfig);
document.getElementById("config-copy")?.addEventListener("click", copyConfig);
document.getElementById("config-import")?.addEventListener("click", () => importConfig(document.getElementById("config-text").value));
document.getElementById("config-file")?.addEventListener("change", e => importConfigFile(e.target.files[0]));

const configDrop = document.getElementById("config-drop");
configDrop?.addEventListener("click", (e) => {
  if (e.target.id === "config-file") return;
  document.getElementById("config-file").click();
});
configDrop?.addEventListener("dragover", e => { e.preventDefault(); configDrop.classList.add("dragover"); });
configDrop?.addEventListener("dragleave", () => configDrop.classList.remove("dragover"));
configDrop?.addEventListener("drop", e => {
  e.preventDefault();
  configDrop.classList.remove("dragover");
  importConfigFile(e.dataTransfer.files[0]);
});

// search engine dropdown
if (dropdownBtn && dropdownMenu) {
  dropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle("hidden");
  });

  document.querySelectorAll(".engine-option").forEach((option) => {
    option.addEventListener("click", () => {
      setSearchEngine(option.dataset.name, option.dataset.value);
      dropdownMenu.classList.add("hidden");
      document.getElementById("search-input")?.focus();
    });
  });

  document.addEventListener("click", (e) => {
    if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
      dropdownMenu.classList.add("hidden");
    }
  });
}

// === SEARCH ACROSS ALL LINKS ===
function searchAllLinks(query) {
  const q = query.toLowerCase();
  return links
    .filter(l => l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q))
    .map(l => ({ ...l, categoryName: categories.find(c => c.id === l.categoryId)?.name || "" }));
}

// === APP CONTEXT FOR KEYBOARD ENGINE ===
const appContext = {
  get isEditMode() { return isEditMode; },
  isKeyboardDriven: () => settings.keyboardDriven !== false,
  getCategoryByKey: (key) => categories.find(c => c.key?.toUpperCase() === key.toUpperCase()),
  getLinkByKey: (catId, key) => links.find(l => l.categoryId === catId && l.key?.toUpperCase() === key.toUpperCase()),
  getFavoriteLink: (digit) => links.find(l => l.favorite === digit),
  getAllLinks: () => links,
  searchAllLinks,
  switchCategory: (id) => scrollToCategory(id),
  navigateCategory,
  isAnyModalOpen,
  closeAllModals,
  submitActiveModal,
  toggleHelpModal,
  openSettingsModal,
  openAddLinkModal,
  toggleEditMode,
  setSearchEngine,
  getCurrentEngineUrl,
  assignFavoritePrompt: (digit) => {
    const linkName = prompt(`Enter name of bookmark to assign to favorite [${digit}]:`);
    if (!linkName) return;
    const link = links.find(l => l.name.toLowerCase().includes(linkName.toLowerCase()));
    if (link) {
      links.forEach(l => { if (l.favorite === digit) delete l.favorite; });
      link.favorite = digit;
      saveData();
      render();
      keyboardEngine?.showHud(`★ [${digit}] Assigned to ${link.name}`, 1500);
    } else {
      keyboardEngine?.showHud(`No bookmark matching "${linkName}"`, 1800);
    }
  }
};

// === INITIALIZATION ===
loadData();
loadSettings();
const savedEngine = [...document.querySelectorAll(".engine-option")].find(o => o.dataset.value === settings.lastEngine);
if (savedEngine) setSearchEngine(savedEngine.dataset.name, savedEngine.dataset.value);
render();

keyboardEngine = new KeyboardEngine(appContext);

setTimeout(() => scrollToCategory(currentCategoryId), 100);
