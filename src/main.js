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

document.getElementById("edit-btn")?.addEventListener("click", toggleEditMode);

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
