/* ==========================================================================
   LR — LEARNING RESOURCES HUB APPLICATION LOGIC
   Connected to Supabase Auth, PostgreSQL (RLS + RPC), and Storage
   ========================================================================== */

// 1. SUPABASE CONFIGURATION (Replace with your Supabase Project Credentials)
const SUPABASE_URL = 'https://fkjsdidutnzultropejw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AUWEEsF69w698pCoXRhYtA_adkbcSqJ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Default Placeholder Cover SVG Data URI
const DEFAULT_BOOK_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1e3a8a"/>
      </linearGradient>
    </defs>
    <rect width="300" height="400" fill="url(#g)"/>
    <text x="150" y="195" font-family="sans-serif" font-size="48" font-weight="bold" fill="#ffffff" text-anchor="middle">LR</text>
    <text x="150" y="230" font-family="sans-serif" font-size="14" fill="#dbeafe" text-anchor="middle">Learning Resources Hub</text>
  </svg>`);

// Global Application State
const state = {
  user: null,
  profile: null,
  preferences: {
    theme: localStorage.getItem('lr_theme') || 'light',
    text_scale: parseFloat(localStorage.getItem('lr_text_scale')) || 1.0,
    notifications_enabled: true,
    notify_due_dates: true,
    notify_announcements: true
  },
  categories: [],
  books: [],
  announcements: [],
  siteSettings: null,
  selectedCategory: 'all',
  selectedBook: null,
  selectedAnnouncement: null
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  applyTheme(state.preferences.theme, false);
  applyTextScale(state.preferences.text_scale, false);

  setupNavigation();
  setupParallax();
  setupEventListeners();

  // Check active Supabase Auth session
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    await handleAuthenticatedUser(session.user);
  } else {
    updateAuthUI();
  }

  // Listen for auth state changes across tabs/sessions
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      await handleAuthenticatedUser(session.user);
    } else {
      state.user = null;
      state.profile = null;
      updateAuthUI();
    }
  });

  // Load initial public library data
  await Promise.all([
    loadSiteSettings(),
    loadCategories(),
    loadBooks(),
    loadAnnouncements()
  ]);
});

// ==========================================================================
// UTILITY HELPERS (Sanitization, Toasts, Modals)
// ==========================================================================
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3600);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.hidden = false;
    lucide.createIcons();
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ==========================================================================
// NAVIGATION & PARALLAX SCROLLING
// ==========================================================================
function setupNavigation() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(btn.getAttribute('data-nav'));
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
  });

  document.querySelectorAll('.glass-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });
}

function navigateTo(sectionName) {
  const titles = {
    home: ['Home', 'Learning Resources Hub'],
    books: ['Books Catalog', 'Browse, search, and reserve available volumes'],
    bulletin: ['Bulletin Board', 'Official announcements and campus library notices'],
    settings: ['Settings', 'Manage administrator access, appearance, and account preferences'],
    feedback: ['Feedback', 'Share suggestions or book requests with librarians'],
    credits: ['Credits', 'Development team, design system, and acknowledgments']
  };

  document.querySelectorAll('.page-section').forEach(sec => (sec.hidden = true));
  const target = document.getElementById(`section-${sectionName}`);
  if (target) target.hidden = false;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-nav') === sectionName);
  });

  const [heading, sub] = titles[sectionName] || ['Learning Resources Hub', ''];
  document.getElementById('page-heading').textContent = heading;
  document.getElementById('page-subheading').textContent = sub;

  if (sectionName === 'feedback' && state.user) {
    loadUserFeedback();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layers = document.querySelectorAll('[data-speed]');
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        layers.forEach(layer => {
          const speed = parseFloat(layer.getAttribute('data-speed')) || 0;
          layer.style.transform = `translate3d(0, ${scrollY * speed}px, 0)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

// ==========================================================================
// THEME (LIGHT/DARK) & APPEARANCE PREFERENCES
// ==========================================================================
function applyTheme(theme, persist = true) {
  state.preferences.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.preferences.theme);
  localStorage.setItem('lr_theme', state.preferences.theme);

  const isDark = state.preferences.theme === 'dark';
  document.getElementById('theme-icon-sun').hidden = isDark;
  document.getElementById('theme-icon-moon').hidden = !isDark;
  document.getElementById('set-light-mode').classList.toggle('active', !isDark);
  document.getElementById('set-dark-mode').classList.toggle('active', isDark);

  if (persist && state.user) {
    saveUserPreferencesToDB();
  }
}

function applyTextScale(scale, persist = true) {
  const clamped = Math.min(1.25, Math.max(0.85, Number(scale.toFixed(2))));
  state.preferences.text_scale = clamped;
  document.documentElement.style.setProperty('--text-scale', clamped);
  localStorage.setItem('lr_text_scale', clamped);
  document.getElementById('text-size-label').textContent = `${Math.round(clamped * 100)}%`;

  if (persist && state.user) {
    saveUserPreferencesToDB();
  }
}

async function saveUserPreferencesToDB() {
  if (!state.user) return;
  await supabaseClient.from('user_preferences').upsert({
    user_id: state.user.id,
    theme: state.preferences.theme,
    text_scale: state.preferences.text_scale,
    notifications_enabled: state.preferences.notifications_enabled,
    notify_due_dates: state.preferences.notify_due_dates,
    notify_announcements: state.preferences.notify_announcements,
    updated_at: new Date().toISOString()
  });
}

// ==========================================================================
// AUTHENTICATION, USER PROFILE & ADMIN VERIFICATION
// ==========================================================================
async function handleAuthenticatedUser(user) {
  state.user = user;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile && !profile.is_active) {
    await supabaseClient.auth.signOut();
    showToast('Your account has been deactivated by an administrator.', 'error');
    return;
  }

  state.profile = profile;

  const { data: prefs } = await supabaseClient
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (prefs) {
    state.preferences = { ...state.preferences, ...prefs };
    applyTheme(prefs.theme, false);
    applyTextScale(Number(prefs.text_scale) || 1.0, false);
    document.getElementById('pref-notifications-enabled').checked = prefs.notifications_enabled;
    document.getElementById('pref-notify-due').checked = prefs.notify_due_dates;
    document.getElementById('pref-notify-announcements').checked = prefs.notify_announcements;
  }

  updateAuthUI();
}

function updateAuthUI() {
  const isLoggedIn = Boolean(state.user && state.profile);
  const isAdmin = Boolean(state.profile?.is_admin);

  document.getElementById('guest-auth-controls').hidden = isLoggedIn;
  document.getElementById('user-profile-btn').hidden = !isLoggedIn;
  document.getElementById('sidebar-user-card').hidden = !isLoggedIn;
  document.getElementById('admin-panel-btn').hidden = !isAdmin;

  // Toggle admin-only UI controls
  document.querySelectorAll('.admin-only-inline').forEach(el => {
    el.hidden = !isAdmin;
  });

  // Settings & Feedback authenticated states
  document.getElementById('admin-verified-banner').hidden = !isAdmin;
  document.getElementById('account-settings-guest-msg').hidden = isLoggedIn;
  document.getElementById('account-settings-form').hidden = !isLoggedIn;
  document.getElementById('feedback-guest-notice').hidden = isLoggedIn;

  if (isLoggedIn) {
    const p = state.profile;
    const fullName = `${p.first_name} ${p.middle_initial ? p.middle_initial + '. ' : ''}${p.last_name}`.trim();
    const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase() || 'LR';

    document.getElementById('topbar-username').textContent = p.username;
    document.getElementById('sidebar-user-name').textContent = fullName;
    document.getElementById('sidebar-user-email').textContent = p.email;
    document.getElementById('sidebar-user-role').textContent = isAdmin ? `${p.account_type} • Admin` : p.account_type;

    // Avatars
    const hasAvatar = Boolean(p.avatar_url);
    ['topbar', 'sidebar', 'panel'].forEach(prefix => {
      const img = document.getElementById(`${prefix}-avatar-img`);
      const fb = document.getElementById(`${prefix}-avatar-fallback`);
      if (hasAvatar) {
        img.src = p.avatar_url;
        img.hidden = false;
        fb.hidden = true;
      } else {
        img.hidden = true;
        fb.hidden = false;
        fb.textContent = initials;
      }
    });

    // Populate Settings & Feedback inputs
    document.getElementById('set-username').value = p.username || '';
    document.getElementById('set-email').value = p.email || '';
    document.getElementById('set-address').value = p.home_address || '';
    document.getElementById('set-school').value = p.school_info || '';
    document.getElementById('fb-name').value = fullName;

    // Profile Modal metadata
    document.getElementById('panel-full-name').textContent = fullName;
    document.getElementById('panel-account-type').textContent = p.account_type;
    document.getElementById('panel-role-badge').textContent = isAdmin ? 'Administrator' : 'Regular Member';
    document.getElementById('panel-email').textContent = p.email;
    document.getElementById('panel-birthday').textContent = formatDate(p.birthday);
    document.getElementById('prof-username').value = p.username || '';
    document.getElementById('prof-address').value = p.home_address || '';
    document.getElementById('prof-school').value = p.school_info || '';
  } else {
    document.getElementById('fb-name').value = '';
  }
}

async function uploadToBucket(bucket, file, folderPrefix = '') {
  const ext = file.name.split('.').pop();
  const filePath = `${folderPrefix}${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabaseClient.storage.from(bucket).upload(filePath, file, { upsert: true });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

// ==========================================================================
// HOMEPAGE CONTENT & CUSTOMIZATION
// ==========================================================================
async function loadSiteSettings() {
  const { data } = await supabaseClient.from('site_settings').select('*').eq('id', 1).single();
  if (!data) return;
  state.siteSettings = data;

  document.getElementById('home-welcome-title').textContent = data.welcome_title;
  document.getElementById('home-welcome-subtitle').textContent = data.welcome_subtitle;
  document.getElementById('home-library-intro').textContent = data.library_intro;

  document.getElementById('home-featured-wrapper').hidden = !data.show_featured;
  document.getElementById('home-recent-wrapper').hidden = !data.show_recent;
  document.getElementById('home-announcements-wrapper').hidden = !data.show_announcements;

  // Populate customizer inputs
  document.getElementById('cust-welcome-title').value = data.welcome_title;
  document.getElementById('cust-welcome-subtitle').value = data.welcome_subtitle;
  document.getElementById('cust-library-intro').value = data.library_intro;
  document.getElementById('cust-show-featured').checked = data.show_featured;
  document.getElementById('cust-show-recent').checked = data.show_recent;
  document.getElementById('cust-show-announcements').checked = data.show_announcements;
}

// ==========================================================================
// BOOKS & CATEGORIES MANAGEMENT
// ==========================================================================
async function loadCategories() {
  const { data, error } = await supabaseClient.from('categories').select('*').order('name');
  if (error) return;
  state.categories = data || [];
  document.getElementById('stat-total-categories').textContent = state.categories.length;

  // Render Filter Pills
  const pillsBar = document.getElementById('category-filter-pills');
  pillsBar.innerHTML = `<button class="cat-pill ${state.selectedCategory === 'all' ? 'active' : ''}" data-category="all">All Books</button>` +
    state.categories.map(cat =>
      `<button class="cat-pill ${state.selectedCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">${escapeHTML(cat.name)}</button>`
    ).join('');

  pillsBar.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.getAttribute('data-category');
      pillsBar.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBooksCatalog();
    });
  });

  // Populate Book Editor Select Dropdown
  const select = document.getElementById('book-form-category');
  select.innerHTML = state.categories.length
    ? state.categories.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')
    : '<option value="">Uncategorized (Create a category first)</option>';

  // Populate Admin Category Manager List
  const adminList = document.getElementById('admin-categories-list');
  adminList.innerHTML = state.categories.length
    ? state.categories.map(c => `
      <div class="list-item-card">
        <strong>${escapeHTML(c.name)}</strong>
        <div class="form-btn-row">
          <button type="button" class="neu-btn sm" onclick="editCategory('${c.id}', '${escapeHTML(c.name)}')">Edit</button>
          <button type="button" class="neu-btn sm danger" onclick="deleteCategory('${c.id}')">Delete</button>
        </div>
      </div>`).join('')
    : '<p class="section-desc">No categories created yet.</p>';
}

window.editCategory = function (id, name) {
  document.getElementById('edit-category-id').value = id;
  document.getElementById('category-name-input').value = name;
  document.getElementById('save-category-btn').textContent = 'Update Category';
};

window.deleteCategory = async function (id) {
  if (!confirm('Delete this category? Books in this category will remain in the catalog.')) return;
  const { error } = await supabaseClient.from('categories').delete().eq('id', id);
  if (error) return showToast(error.message, 'error');
  showToast('Category deleted.');
  await loadCategories();
  await loadBooks();
};

async function loadBooks() {
  const { data, error } = await supabaseClient
    .from('books')
    .select('*, categories(name)')
    .order('created_at', { ascending: false });

  if (error) return;
  state.books = data || [];

  // Update Home Metrics
  const totalVols = state.books.reduce((sum, b) => sum + (b.total_quantity || 0), 0);
  const availVols = state.books.reduce((sum, b) => sum + (b.available_quantity || 0), 0);
  document.getElementById('stat-total-books').textContent = totalVols;
  document.getElementById('stat-available-books').textContent = availVols;

  // Render Featured & Recent on Home
  const featured = state.books.filter(b => b.is_featured).slice(0, 4);
  const recent = state.books.slice(0, 4);
  renderBookGrid('home-featured-grid', featured.length ? featured : recent);
  renderBookGrid('home-recent-grid', recent);

  renderBooksCatalog();
}

function getBookStatusInfo(book) {
  if (book.available_quantity > 0) {
    return { label: `Available (${book.available_quantity})`, cls: 'available' };
  }
  if (book.total_quantity > 0 && book.available_quantity === 0) {
    return { label: 'Borrowed (0 Left)', cls: 'borrowed' };
  }
  return { label: 'Unavailable', cls: 'unavailable' };
}

function renderBookGrid(containerId, booksList) {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  grid.innerHTML = booksList.map(book => {
    const status = getBookStatusInfo(book);
    const catName = book.categories?.name || 'General';
    return `
      <article class="book-card" data-book-id="${book.id}" tabindex="0" role="button" aria-label="View ${escapeHTML(book.title)}">
        <div class="book-cover-frame">
          <img src="${escapeHTML(book.cover_url || DEFAULT_BOOK_COVER)}" alt="${escapeHTML(book.title)} cover" loading="lazy" />
          <span class="status-pill ${status.cls}">${status.label}</span>
        </div>
        <span class="category-chip">${escapeHTML(catName)}</span>
        <h4 class="book-card-title">${escapeHTML(book.title)}</h4>
        <p class="book-card-author">${escapeHTML(book.author)}</p>
      </article>`;
  }).join('');

  grid.querySelectorAll('.book-card').forEach(card => {
    const open = () => openBookDetails(card.getAttribute('data-book-id'));
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function renderBooksCatalog() {
  const query = document.getElementById('books-search-input').value.trim().toLowerCase();
  const availFilter = document.getElementById('books-availability-filter').value;
  document.getElementById('books-clear-search').hidden = !query;

  const filtered = state.books.filter(book => {
    const matchesCat = state.selectedCategory === 'all' || book.category_id === state.selectedCategory;
    const matchesQuery = !query ||
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query) ||
      book.publisher.toLowerCase().includes(query);
    const matchesAvail =
      availFilter === 'all' ||
      (availFilter === 'available' && book.available_quantity > 0) ||
      (availFilter === 'unavailable' && book.available_quantity <= 0);
    return matchesCat && matchesQuery && matchesAvail;
  });

  renderBookGrid('books-catalog-grid', filtered);
  document.getElementById('books-empty-state').hidden = filtered.length > 0;
}

function openBookDetails(bookId) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;
  state.selectedBook = book;

  const status = getBookStatusInfo(book);
  document.getElementById('detail-book-cover').src = book.cover_url || DEFAULT_BOOK_COVER;
  document.getElementById('detail-status-badge').className = `status-pill ${status.cls}`;
  document.getElementById('detail-status-badge').textContent = status.label;
  document.getElementById('detail-book-category').textContent = book.categories?.name || 'General';
  document.getElementById('detail-book-title').textContent = book.title;
  document.getElementById('detail-book-author').textContent = book.author;
  document.getElementById('detail-book-publisher').textContent = book.publisher;
  document.getElementById('detail-total-qty').textContent = book.total_quantity;
  document.getElementById('detail-avail-qty').textContent = book.available_quantity;
  document.getElementById('detail-book-desc').textContent = book.description || 'No description provided for this title.';

  const borrowBtn = document.getElementById('initiate-borrow-btn');
  if (book.available_quantity > 0) {
    borrowBtn.disabled = false;
    borrowBtn.textContent = 'Borrow a Book';
  } else {
    borrowBtn.disabled = true;
    borrowBtn.textContent = 'Currently Unavailable';
  }

  document.getElementById('borrow-book-form').hidden = true;
  openModal('book-detail-modal');
}

// ==========================================================================
// ANNOUNCEMENTS / BULLETIN BOARD
// ==========================================================================
async function loadAnnouncements() {
  const { data, error } = await supabaseClient
    .from('announcements')
    .select('*')
    .order('publication_date', { ascending: false });

  if (error) return;
  state.announcements = data || [];

  const badge = document.getElementById('bulletin-count-badge');
  badge.textContent = state.announcements.length;
  badge.hidden = state.announcements.length === 0;

  renderAnnouncements('home-announcements-grid', state.announcements.slice(0, 3));
  renderAnnouncements('bulletin-grid', state.announcements);
  document.getElementById('bulletin-empty-state').hidden = state.announcements.length > 0;
}

function renderAnnouncements(containerId, list) {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  grid.innerHTML = list.map(ann => `
    <article class="announcement-card" data-ann-id="${ann.id}" tabindex="0" role="button">
      <span class="category-chip">${formatDate(ann.publication_date)}</span>
      <h4>${escapeHTML(ann.title)}</h4>
      ${ann.image_url ? `<img src="${escapeHTML(ann.image_url)}" alt="${escapeHTML(ann.title)}" class="announcement-thumb" loading="lazy" />` : ''}
      <p class="announcement-excerpt">${escapeHTML(ann.content)}</p>
    </article>`).join('');

  grid.querySelectorAll('.announcement-card').forEach(card => {
    card.addEventListener('click', () => openAnnouncementDetail(card.getAttribute('data-ann-id')));
  });
}

function openAnnouncementDetail(annId) {
  const ann = state.announcements.find(a => a.id === annId);
  if (!ann) return;
  state.selectedAnnouncement = ann;

  document.getElementById('ann-detail-date').textContent = formatDate(ann.publication_date);
  document.getElementById('ann-detail-title').textContent = ann.title;
  document.getElementById('ann-detail-content').textContent = ann.content;

  const img = document.getElementById('ann-detail-img');
  if (ann.image_url) {
    img.src = ann.image_url;
    img.hidden = false;
  } else {
    img.hidden = true;
  }

  openModal('announcement-detail-modal');
}

// ==========================================================================
// USER BORROWING RECORDS & FEEDBACK HISTORY
// ==========================================================================
async function loadUserBorrowingRecords() {
  if (!state.user) return;
  const container = document.getElementById('user-borrowing-records');
  container.innerHTML = '<p class="section-desc">Loading borrowing records...</p>';

  const { data, error } = await supabaseClient
    .from('borrowing_transactions')
    .select('*, books(title)')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    container.innerHTML = '<p class="section-desc">No borrowing transactions recorded yet.</p>';
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  container.innerHTML = data.map(tx => {
    const isOverdue = tx.status === 'Borrowed' && tx.expected_return_date < today;
    const statusLabel = isOverdue ? 'Overdue' : tx.status;
    const statusCls = statusLabel.toLowerCase();
    return `
      <div class="list-item-card">
        <div>
          <strong>${escapeHTML(tx.books?.title || 'Book')}</strong>
          <p class="section-desc">Borrowed: ${formatDate(tx.borrowing_date)} &bull; Due: ${formatDate(tx.expected_return_date)}</p>
        </div>
        <span class="status-pill ${statusCls}">${statusLabel}</span>
      </div>`;
  }).join('');
}

async function loadUserFeedback() {
  if (!state.user) return;
  const list = document.getElementById('my-feedback-list');
  const { data } = await supabaseClient
    .from('feedback')
    .select('*')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });

  if (!data?.length) {
    list.innerHTML = '<p class="section-desc">You have not submitted any feedback yet.</p>';
    return;
  }

  list.innerHTML = data.map(fb => `
    <div class="list-item-card" style="flex-direction:column; align-items:flex-start;">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <strong>${escapeHTML(fb.subject)}</strong>
        <span class="category-chip">${new Date(fb.created_at).toLocaleDateString()}</span>
      </div>
      <p class="section-desc">${escapeHTML(fb.message)}</p>
    </div>`).join('');
}

// ==========================================================================
// ADMINISTRATIVE DASHBOARD DATA
// ==========================================================================
async function loadAdminDashboardData() {
  if (!state.profile?.is_admin) return;

  // 1. Load All Borrowed Books
  const { data: borrows } = await supabaseClient
    .from('borrowing_transactions')
    .select('*, books(title), profiles(username)')
    .order('created_at', { ascending: false });

  const today = new Date().toISOString().split('T')[0];
  const borrowsTbody = document.getElementById('admin-borrows-tbody');
  borrowsTbody.innerHTML = (borrows || []).map(tx => {
    const isOverdue = tx.status === 'Borrowed' && tx.expected_return_date < today;
    const displayStatus = isOverdue ? 'Overdue' : tx.status;
    return `
      <tr>
        <td>${escapeHTML(tx.borrower_full_name)}</td>
        <td>@${escapeHTML(tx.profiles?.username || 'user')}</td>
        <td><strong>${escapeHTML(tx.books?.title || 'Deleted Book')}</strong></td>
        <td>${formatDate(tx.borrowing_date)}</td>
        <td>${formatDate(tx.expected_return_date)}</td>
        <td>${formatDate(tx.actual_return_date)}</td>
        <td><span class="status-pill ${displayStatus.toLowerCase()}">${displayStatus}</span></td>
        <td>
          ${tx.status !== 'Returned'
            ? `<button type="button" class="btn-primary-pill" style="padding:5px 12px;font-size:0.78rem;" onclick="markBookReturned('${tx.id}')">Mark Returned</button>`
            : '<span class="section-desc">Completed</span>'}
        </td>
      </tr>`;
  }).join('');

  // 2. Load All Registered Users
  const { data: users } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  const usersTbody = document.getElementById('admin-users-tbody');
  usersTbody.innerHTML = (users || []).map(u => `
    <tr>
      <td>${escapeHTML(u.first_name)} ${escapeHTML(u.last_name)}</td>
      <td>@${escapeHTML(u.username)}</td>
      <td>${escapeHTML(u.account_type)}</td>
      <td>${escapeHTML(u.email)}</td>
      <td><span class="category-chip">${u.is_admin ? 'Admin' : 'Member'}</span></td>
      <td><span class="status-pill ${u.is_active ? 'available' : 'unavailable'}">${u.is_active ? 'Active' : 'Suspended'}</span></td>
      <td>
        ${u.id !== state.user.id
          ? `<button type="button" class="neu-btn sm" onclick="toggleUserActive('${u.id}', ${!u.is_active})">${u.is_active ? 'Suspend' : 'Activate'}</button>`
          : '<span class="section-desc">Current</span>'}
      </td>
    </tr>`).join('');

  // 3. Load All User Feedback
  const { data: feedbacks } = await supabaseClient
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });

  const fbContainer = document.getElementById('admin-feedback-list');
  fbContainer.innerHTML = (feedbacks || []).length
    ? feedbacks.map(fb => `
      <div class="list-item-card" style="flex-direction:column; align-items:flex-start;">
        <div style="display:flex; justify-content:space-between; width:100%;">
          <strong>${escapeHTML(fb.subject)} — <span style="color:var(--accent-primary)">${escapeHTML(fb.submitter_name)}</span></strong>
          <span class="category-chip">${new Date(fb.created_at).toLocaleDateString()}</span>
        </div>
        <p class="section-desc">${escapeHTML(fb.message)}</p>
      </div>`).join('')
    : '<p class="section-desc">No user feedback submitted yet.</p>';
}

window.markBookReturned = async function (txId) {
  const { error } = await supabaseClient.rpc('return_book', { p_transaction_id: txId });
  if (error) return showToast(error.message, 'error');
  showToast('Book marked as returned and available quantity restored.');
  await Promise.all([loadBooks(), loadAdminDashboardData()]);
};

window.toggleUserActive = async function (userId, nextState) {
  const { error } = await supabaseClient.from('profiles').update({ is_active: nextState }).eq('id', userId);
  if (error) return showToast(error.message, 'error');
  showToast(`User account ${nextState ? 'activated' : 'suspended'}.`);
  await loadAdminDashboardData();
};

// ==========================================================================
// ALL INTERACTIVE FORM & BUTTON EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  // Theme Toggle & Appearance Controls
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    applyTheme(state.preferences.theme === 'light' ? 'dark' : 'light');
  });
  document.getElementById('set-light-mode').addEventListener('click', () => applyTheme('light'));
  document.getElementById('set-dark-mode').addEventListener('click', () => applyTheme('dark'));
  document.getElementById('increase-text-btn').addEventListener('click', () => applyTextScale(state.preferences.text_scale + 0.05));
  document.getElementById('decrease-text-btn').addEventListener('click', () => applyTextScale(state.preferences.text_scale - 0.05));
  document.getElementById('reset-text-btn').addEventListener('click', () => applyTextScale(1.0));

  // Notification Preferences Save
  document.getElementById('save-notif-prefs-btn').addEventListener('click', async () => {
    state.preferences.notifications_enabled = document.getElementById('pref-notifications-enabled').checked;
    state.preferences.notify_due_dates = document.getElementById('pref-notify-due').checked;
    state.preferences.notify_announcements = document.getElementById('pref-notify-announcements').checked;
    if (!state.user) return showToast('Sign in to save notification preferences permanently.', 'error');
    await saveUserPreferencesToDB();
    showToast('Notification preferences saved.');
  });

  // Auth Modal Triggers
  const switchAuthTab = (mode) => {
    const isSignIn = mode === 'signin';
    document.getElementById('tab-signin').classList.toggle('active', isSignIn);
    document.getElementById('tab-signup').classList.toggle('active', !isSignIn);
    document.getElementById('signin-form').hidden = !isSignIn;
    document.getElementById('signup-form').hidden = isSignIn;
  };

  document.getElementById('open-signin-btn').addEventListener('click', () => { switchAuthTab('signin'); openModal('auth-modal'); });
  document.getElementById('open-signup-btn').addEventListener('click', () => { switchAuthTab('signup'); openModal('auth-modal'); });
  document.getElementById('settings-signin-prompt').addEventListener('click', () => { switchAuthTab('signin'); openModal('auth-modal'); });
  document.getElementById('tab-signin').addEventListener('click', () => switchAuthTab('signin'));
  document.getElementById('tab-signup').addEventListener('click', () => switchAuthTab('signup'));

  // Sign Up Submission
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const metadata = {
      first_name: document.getElementById('reg-first-name').value.trim(),
      middle_initial: document.getElementById('reg-middle-initial').value.trim(),
      last_name: document.getElementById('reg-last-name').value.trim(),
      birthday: document.getElementById('reg-birthday').value,
      account_type: document.getElementById('reg-account-type').value,
      username: document.getElementById('reg-username').value.trim()
    };

    const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: metadata } });
    if (error) return showToast(error.message, 'error');

    closeModal('auth-modal');
    showToast('Account created! Check your email if verification is enabled, or sign in.');
  });

  // Sign In Submission (Username -> Email lookup via RPC)
  document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('signin-username').value.trim();
    const password = document.getElementById('signin-password').value;

    let loginEmail = usernameInput;
    if (!usernameInput.includes('@')) {
      const { data: resolvedEmail, error: rpcErr } = await supabaseClient.rpc('get_email_by_username', { p_username: usernameInput });
      if (rpcErr || !resolvedEmail) {
        return showToast('Invalid username or inactive account.', 'error');
      }
      loginEmail = resolvedEmail;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email: loginEmail, password });
    if (error) return showToast(error.message, 'error');

    closeModal('auth-modal');
    showToast('Signed in successfully.');
  });

  // Logout Triggers
  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    closeModal('profile-modal');
    showToast('You have been logged out.');
  };
  document.getElementById('sidebar-logout-btn').addEventListener('click', handleLogout);
  document.getElementById('panel-logout-btn').addEventListener('click', handleLogout);

  // Open User Profile Floating Panel
  const openProfilePanel = async () => {
    if (!state.user) {
      switchAuthTab('signin');
      return openModal('auth-modal');
    }
    openModal('profile-modal');
    await loadUserBorrowingRecords();
  };
  document.getElementById('user-profile-btn').addEventListener('click', openProfilePanel);
  document.getElementById('sidebar-profile-trigger').addEventListener('click', openProfilePanel);
  document.getElementById('home-my-borrows-shortcut').addEventListener('click', openProfilePanel);

  // Profile Picture Upload
  document.getElementById('profile-pic-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !state.user) return;
    try {
      showToast('Uploading profile picture...');
      const publicUrl = await uploadToBucket('avatars', file, `${state.user.id}/`);
      const { error } = await supabaseClient.from('profiles').update({ avatar_url: publicUrl }).eq('id', state.user.id);
      if (error) throw error;
      state.profile.avatar_url = publicUrl;
      updateAuthUI();
      showToast('Profile picture updated.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Profile Edit Save
  document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return;
    const username = document.getElementById('prof-username').value.trim();
    const home_address = document.getElementById('prof-address').value.trim();
    const school_info = document.getElementById('prof-school').value.trim();
    const newPassword = document.getElementById('prof-password').value;

    const { error } = await supabaseClient
      .from('profiles')
      .update({ username, home_address, school_info })
      .eq('id', state.user.id);
    if (error) return showToast(error.message, 'error');

    if (newPassword) {
      const { error: pwErr } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (pwErr) return showToast(pwErr.message, 'error');
      document.getElementById('prof-password').value = '';
    }

    await handleAuthenticatedUser(state.user);
    showToast('Profile information saved.');
  });

  // Settings Account Form Save
  document.getElementById('account-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return;
    const username = document.getElementById('set-username').value.trim();
    const email = document.getElementById('set-email').value.trim();
    const home_address = document.getElementById('set-address').value.trim();
    const school_info = document.getElementById('set-school').value.trim();
    const newPassword = document.getElementById('set-new-password').value;

    const { error } = await supabaseClient
      .from('profiles')
      .update({ username, email, home_address, school_info })
      .eq('id', state.user.id);
    if (error) return showToast(error.message, 'error');

    const authUpdates = {};
    if (email !== state.user.email) authUpdates.email = email;
    if (newPassword) authUpdates.password = newPassword;
    if (Object.keys(authUpdates).length) {
      const { error: authErr } = await supabaseClient.auth.updateUser(authUpdates);
      if (authErr) return showToast(authErr.message, 'error');
      document.getElementById('set-new-password').value = '';
    }

    await handleAuthenticatedUser(state.user);
    showToast('Account settings updated.');
  });

  // Server-Side Administrator Code Verification
  document.getElementById('admin-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return showToast('Please sign in first before verifying administrator access.', 'error');
    const code = document.getElementById('admin-access-code').value;

    const { data: verified, error } = await supabaseClient.rpc('verify_admin_code', { p_code: code });
    if (error) return showToast(error.message, 'error');

    if (verified) {
      document.getElementById('admin-access-code').value = '';
      await handleAuthenticatedUser(state.user);
      showToast('Administrator privileges verified and permanently enabled!');
    } else {
      showToast('Invalid administrator access code.', 'error');
    }
  });

  // Home Search Shortcut
  document.getElementById('home-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('home-search-input').value;
    document.getElementById('books-search-input').value = q;
    navigateTo('books');
    renderBooksCatalog();
  });

  // Books Search & Availability Filters
  document.getElementById('books-search-input').addEventListener('input', renderBooksCatalog);
  document.getElementById('books-availability-filter').addEventListener('change', renderBooksCatalog);
  document.getElementById('books-clear-search').addEventListener('click', () => {
    document.getElementById('books-search-input').value = '';
    renderBooksCatalog();
  });

  // Books Admin '+' Dropdown Menu
  const plusBtn = document.getElementById('books-plus-btn');
  const plusMenu = document.getElementById('books-plus-menu');
  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = plusMenu.hidden;
    plusMenu.hidden = !open;
    plusBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', () => { plusMenu.hidden = true; });

  document.getElementById('open-add-category-btn').addEventListener('click', () => {
    document.getElementById('edit-category-id').value = '';
    document.getElementById('category-name-input').value = '';
    document.getElementById('save-category-btn').textContent = 'Add Category';
    openModal('category-modal');
  });

  document.getElementById('open-add-book-btn').addEventListener('click', () => {
    document.getElementById('book-editor-title').textContent = 'Add a Book';
    document.getElementById('edit-book-id').value = '';
    document.getElementById('book-editor-form').reset();
    openModal('book-editor-modal');
  });

  // Save Category
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-category-id').value;
    const name = document.getElementById('category-name-input').value.trim();
    if (!name) return;

    const { error } = id
      ? await supabaseClient.from('categories').update({ name }).eq('id', id)
      : await supabaseClient.from('categories').insert({ name });

    if (error) return showToast(error.message, 'error');
    document.getElementById('edit-category-id').value = '';
    document.getElementById('category-name-input').value = '';
    document.getElementById('save-category-btn').textContent = 'Add Category';
    showToast(id ? 'Category updated.' : 'Category created.');
    await loadCategories();
  });

  // Save / Edit Book
  document.getElementById('book-editor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-book-id').value;
    const title = document.getElementById('book-form-title').value.trim();
    const category_id = document.getElementById('book-form-category').value || null;
    const total_quantity = parseInt(document.getElementById('book-form-quantity').value, 10);
    const author = document.getElementById('book-form-author').value.trim();
    const publisher = document.getElementById('book-form-publisher').value.trim();
    const is_featured = document.getElementById('book-form-featured').checked;
    const description = document.getElementById('book-form-desc').value.trim();
    const coverFile = document.getElementById('book-form-cover').files?.[0];

    try {
      let cover_url = id ? state.books.find(b => b.id === id)?.cover_url : null;
      if (coverFile) {
        cover_url = await uploadToBucket('book-covers', coverFile, 'covers/');
      }

      if (id) {
        const existing = state.books.find(b => b.id === id);
        const borrowedCount = (existing.total_quantity || 0) - (existing.available_quantity || 0);
        const available_quantity = Math.max(0, total_quantity - borrowedCount);
        const { error } = await supabaseClient.from('books').update({
          title, category_id, total_quantity, available_quantity, author, publisher, is_featured, description, cover_url
        }).eq('id', id);
        if (error) throw error;
        showToast('Book updated successfully.');
      } else {
        const { error } = await supabaseClient.from('books').insert({
          title, category_id, total_quantity, available_quantity: total_quantity, author, publisher, is_featured, description, cover_url
        });
        if (error) throw error;
        showToast('Book added to catalog.');
      }

      closeModal('book-editor-modal');
      await loadBooks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Edit / Delete Selected Book from Detail Modal
  document.getElementById('edit-current-book-btn').addEventListener('click', () => {
    const b = state.selectedBook;
    if (!b) return;
    closeModal('book-detail-modal');
    document.getElementById('book-editor-title').textContent = 'Edit Book';
    document.getElementById('edit-book-id').value = b.id;
    document.getElementById('book-form-title').value = b.title;
    document.getElementById('book-form-category').value = b.category_id || '';
    document.getElementById('book-form-quantity').value = b.total_quantity;
    document.getElementById('book-form-author').value = b.author;
    document.getElementById('book-form-publisher').value = b.publisher;
    document.getElementById('book-form-featured').checked = Boolean(b.is_featured);
    document.getElementById('book-form-desc').value = b.description || '';
    openModal('book-editor-modal');
  });

  document.getElementById('delete-current-book-btn').addEventListener('click', async () => {
    if (!state.selectedBook || !confirm(`Delete "${state.selectedBook.title}" permanently?`)) return;
    const { error } = await supabaseClient.from('books').delete().eq('id', state.selectedBook.id);
    if (error) return showToast(error.message, 'error');
    closeModal('book-detail-modal');
    showToast('Book deleted.');
    await loadBooks();
  });

  // Initiate Borrowing Flow
  document.getElementById('initiate-borrow-btn').addEventListener('click', () => {
    if (!state.user || !state.profile) {
      closeModal('book-detail-modal');
      switchAuthTab('signin');
      openModal('auth-modal');
      return showToast('Please sign in to borrow a book.', 'error');
    }
    const p = state.profile;
    const fullName = `${p.first_name} ${p.middle_initial ? p.middle_initial + '. ' : ''}${p.last_name}`.trim();
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 86400000);

    document.getElementById('borrow-book-title').value = state.selectedBook.title;
    document.getElementById('borrow-user-fullname').value = fullName;
    document.getElementById('borrow-date').value = today.toISOString().split('T')[0];
    document.getElementById('borrow-return-date').value = nextWeek.toISOString().split('T')[0];
    document.getElementById('borrow-book-form').hidden = false;
  });

  document.getElementById('cancel-borrow-btn').addEventListener('click', () => {
    document.getElementById('borrow-book-form').hidden = true;
  });

  // Submit Atomic Borrow Transaction via RPC
  document.getElementById('borrow-book-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedBook || !state.user) return;
    const p_borrowing_date = document.getElementById('borrow-date').value;
    const p_expected_return_date = document.getElementById('borrow-return-date').value;

    const { error } = await supabaseClient.rpc('borrow_book', {
      p_book_id: state.selectedBook.id,
      p_borrowing_date,
      p_expected_return_date
    });

    if (error) return showToast(error.message, 'error');
    closeModal('book-detail-modal');
    showToast('Book borrowed! Record added to your account.');
    await loadBooks();
  });

  // Bulletin Board: Create / Edit / Delete Announcements
  document.getElementById('bulletin-plus-btn').addEventListener('click', () => {
    document.getElementById('ann-editor-heading').textContent = 'Create Announcement';
    document.getElementById('edit-ann-id').value = '';
    document.getElementById('announcement-form').reset();
    document.getElementById('ann-form-date').value = new Date().toISOString().split('T')[0];
    openModal('announcement-editor-modal');
  });

  document.getElementById('announcement-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-ann-id').value;
    const title = document.getElementById('ann-form-title').value.trim();
    const publication_date = document.getElementById('ann-form-date').value;
    const content = document.getElementById('ann-form-content').value.trim();
    const imgFile = document.getElementById('ann-form-image').files?.[0];

    try {
      let image_url = id ? state.announcements.find(a => a.id === id)?.image_url : null;
      if (imgFile) {
        image_url = await uploadToBucket('announcements', imgFile, 'posts/');
      }

      const payload = { title, publication_date, content, image_url, author_id: state.user.id };
      const { error } = id
        ? await supabaseClient.from('announcements').update(payload).eq('id', id)
        : await supabaseClient.from('announcements').insert(payload);

      if (error) throw error;
      closeModal('announcement-editor-modal');
      showToast(id ? 'Announcement updated.' : 'Announcement published.');
      await loadAnnouncements();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('edit-ann-btn').addEventListener('click', () => {
    const a = state.selectedAnnouncement;
    if (!a) return;
    closeModal('announcement-detail-modal');
    document.getElementById('ann-editor-heading').textContent = 'Edit Announcement';
    document.getElementById('edit-ann-id').value = a.id;
    document.getElementById('ann-form-title').value = a.title;
    document.getElementById('ann-form-date').value = a.publication_date;
    document.getElementById('ann-form-content').value = a.content;
    openModal('announcement-editor-modal');
  });

  document.getElementById('delete-ann-btn').addEventListener('click', async () => {
    if (!state.selectedAnnouncement || !confirm('Delete this announcement?')) return;
    const { error } = await supabaseClient.from('announcements').delete().eq('id', state.selectedAnnouncement.id);
    if (error) return showToast(error.message, 'error');
    closeModal('announcement-detail-modal');
    showToast('Announcement deleted.');
    await loadAnnouncements();
  });

  // Homepage Customizer (Admin Only)
  document.getElementById('home-customize-btn').addEventListener('click', () => openModal('home-customizer-modal'));
  document.getElementById('home-customizer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = {
      welcome_title: document.getElementById('cust-welcome-title').value.trim(),
      welcome_subtitle: document.getElementById('cust-welcome-subtitle').value.trim(),
      library_intro: document.getElementById('cust-library-intro').value.trim(),
      show_featured: document.getElementById('cust-show-featured').checked,
      show_recent: document.getElementById('cust-show-recent').checked,
      show_announcements: document.getElementById('cust-show-announcements').checked,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabaseClient.from('site_settings').update(updates).eq('id', 1);
    if (error) return showToast(error.message, 'error');
    closeModal('home-customizer-modal');
    showToast('Homepage layout updated.');
    await loadSiteSettings();
  });

  // Feedback Submission
  document.getElementById('feedback-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user || !state.profile) return showToast('Please sign in to submit feedback.', 'error');
    const p = state.profile;
    const submitter_name = `${p.first_name} ${p.last_name}`.trim();
    const subject = document.getElementById('fb-subject').value.trim();
    const message = document.getElementById('fb-message').value.trim();

    const { error } = await supabaseClient.from('feedback').insert({
      user_id: state.user.id,
      submitter_name,
      subject,
      message
    });
    if (error) return showToast(error.message, 'error');
    document.getElementById('fb-subject').value = '';
    document.getElementById('fb-message').value = '';
    showToast('Thank you! Your feedback has been submitted.');
    await loadUserFeedback();
  });

  // Admin Panel Modal & Tabs
  document.getElementById('admin-panel-btn').addEventListener('click', async () => {
    openModal('admin-dashboard-modal');
    await loadAdminDashboardData();
  });
  
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-admin-tab');
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.admin-pane').forEach(p => (p.hidden = true));
      document.getElementById(`admin-pane-${target}`).hidden = false;
    });
  });

  // Admin Dashboard Shortcut Tiles
  document.getElementById('dash-shortcut-books').addEventListener('click', () => {
    closeModal('admin-dashboard-modal');
    navigateTo('books');
    document.getElementById('open-add-book-btn').click();
  });
  document.getElementById('dash-shortcut-categories').addEventListener('click', () => {
    closeModal('admin-dashboard-modal');
    openModal('category-modal');
  });
  document.getElementById('dash-shortcut-announcements').addEventListener('click', () => {
    closeModal('admin-dashboard-modal');
    navigateTo('bulletin');
    document.getElementById('bulletin-plus-btn').click();
  });
  document.getElementById('dash-shortcut-home').addEventListener('click', () => {
    closeModal('admin-dashboard-modal');
    openModal('home-customizer-modal');
  });
}
