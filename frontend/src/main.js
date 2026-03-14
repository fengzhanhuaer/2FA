import { GetAccounts, AddAccount, DeleteAccount, GetTOTPCode } from '../wailsjs/go/main/App.js';

// ── State ───────────────────────────────────────────────────────────────────
let accounts = [];        // [{id, name, issuer, secret}]
let tickInterval = null;
let pendingDeleteId = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const cardsContainer = document.getElementById('cardsContainer');
const emptyState     = document.getElementById('emptyState');

// Add modal
const modalOverlay   = document.getElementById('modalOverlay');
const fieldName      = document.getElementById('fieldName');
const fieldIssuer    = document.getElementById('fieldIssuer');
const fieldSecret    = document.getElementById('fieldSecret');
const modalError     = document.getElementById('modalError');
const btnSave        = document.getElementById('btnSaveAccount');

// Delete modal
const deleteOverlay    = document.getElementById('deleteOverlay');
const deleteAccountName = document.getElementById('deleteAccountName');

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  await refreshAccounts();
  startTick();
}

async function refreshAccounts() {
  accounts = await GetAccounts();
  renderCards();
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderCards() {
  // Remove existing cards (keep emptyState)
  [...cardsContainer.querySelectorAll('.card')].forEach(c => c.remove());

  emptyState.style.display = accounts.length === 0 ? 'flex' : 'none';

  for (const acc of accounts) {
    const card = buildCard(acc);
    cardsContainer.appendChild(card);
  }
}

function buildCard(acc) {
  const R = 22; // ring radius
  const CIRC = 2 * Math.PI * R;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = acc.id;

  card.innerHTML = `
    <div class="card-left">
      <div class="card-issuer">${esc(acc.issuer || acc.name)}</div>
      <div class="card-name">${esc(acc.issuer ? acc.name : '')}</div>
      <div class="card-code green" data-code>------</div>
    </div>
    <div class="card-right">
      <div class="ring-wrap">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle class="ring-bg" cx="26" cy="26" r="${R}"/>
          <circle class="ring-fg" cx="26" cy="26" r="${R}"
            stroke-dasharray="${CIRC}"
            stroke-dashoffset="${CIRC}"
            data-ring
          />
        </svg>
        <div class="ring-label" data-seconds>30</div>
      </div>
      <button class="btn-delete" data-delete="${esc(acc.id)}" title="Delete account">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>
  `;

  // Wire delete button
  card.querySelector('[data-delete]').addEventListener('click', () => openDeleteModal(acc));

  // Store ring circumference for ticking
  card.dataset.circ = CIRC;

  return card;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ── Live code ticker ──────────────────────────────────────────────────────────
function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  updateAllCodes(); // immediate first update
  tickInterval = setInterval(updateAllCodes, 1000);
}

async function updateAllCodes() {
  const cards = cardsContainer.querySelectorAll('.card');
  for (const card of cards) {
    const id = card.dataset.id;
    const acc = accounts.find(a => a.id === id);
    if (!acc) continue;

    const result = await GetTOTPCode(acc.secret);

    const codeEl    = card.querySelector('[data-code]');
    const ringEl    = card.querySelector('[data-ring]');
    const secEl     = card.querySelector('[data-seconds]');
    const circ      = parseFloat(card.dataset.circ);
    const remaining = result.remaining;
    const ratio     = remaining / 30;

    // Format code as "123 456"
    const raw = result.code;
    codeEl.textContent = raw.slice(0, 3) + ' ' + raw.slice(3);

    // Color by urgency
    codeEl.className = 'card-code ' + (remaining > 10 ? 'green' : remaining > 5 ? 'yellow' : 'red');

    // Ring stroke
    const ringColor = remaining > 10 ? '#22d3a0' : remaining > 5 ? '#f5c542' : '#f87171';
    ringEl.style.stroke = ringColor;
    ringEl.style.strokeDashoffset = circ * (1 - ratio);

    secEl.textContent = remaining;
    secEl.style.color = ringColor;
  }
}

// ── Add Account Modal ─────────────────────────────────────────────────────────
document.getElementById('btnAdd').addEventListener('click', openAddModal);
document.getElementById('btnCloseModal').addEventListener('click', closeAddModal);
document.getElementById('btnCancelModal').addEventListener('click', closeAddModal);

function openAddModal() {
  fieldName.value = '';
  fieldIssuer.value = '';
  fieldSecret.value = '';
  modalError.textContent = '';
  btnSave.disabled = false;
  modalOverlay.classList.add('open');
  setTimeout(() => fieldName.focus(), 120);
}

function closeAddModal() {
  modalOverlay.classList.remove('open');
}

modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeAddModal(); });

fieldSecret.addEventListener('input', () => {
  const val = fieldSecret.value.trim();
  if (val.startsWith('otpauth://totp/')) {
    try {
      const url = new URL(val);
      const pathname = decodeURIComponent(url.pathname.replace(/^\//, ''));
      
      // Extract issuer and account name from pathname (e.g., "Issuer:AccountName")
      let issuer = '';
      let accountName = pathname;
      if (pathname.includes(':')) {
        const parts = pathname.split(':');
        issuer = parts[0].trim();
        accountName = parts.slice(1).join(':').trim();
      }

      // Override with query params if they exist
      const queryIssuer = url.searchParams.get('issuer');
      if (queryIssuer) {
        issuer = queryIssuer;
      }
      const querySecret = url.searchParams.get('secret');

      if (querySecret) {
        fieldSecret.value = querySecret;
        if (accountName) fieldName.value = accountName;
        if (issuer) fieldIssuer.value = issuer;
      }
    } catch (e) {
      console.error('Failed to parse otpauth URI:', e);
    }
  }
});

document.getElementById('btnSaveAccount').addEventListener('click', async () => {
  const name   = fieldName.value.trim();
  const issuer = fieldIssuer.value.trim();
  const secret = fieldSecret.value.trim().replace(/\s+/g, '').toUpperCase();

  modalError.textContent = '';
  if (!name) { modalError.textContent = 'Account name is required.'; return; }
  if (!secret) { modalError.textContent = 'TOTP secret is required.'; return; }

  btnSave.disabled = true;
  try {
    await AddAccount(name, issuer, secret);
    closeAddModal();
    await refreshAccounts();
    startTick();
  } catch (err) {
    modalError.textContent = String(err);
  } finally {
    btnSave.disabled = false;
  }
});

// Allow Enter key in modal inputs
[fieldName, fieldIssuer, fieldSecret].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });
});

// ── Delete Account Modal ──────────────────────────────────────────────────────
function openDeleteModal(acc) {
  pendingDeleteId = acc.id;
  deleteAccountName.textContent = acc.issuer ? `${acc.issuer} (${acc.name})` : acc.name;
  deleteOverlay.classList.add('open');
}

document.getElementById('btnCancelDelete').addEventListener('click', () => {
  deleteOverlay.classList.remove('open');
  pendingDeleteId = null;
});

document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  await DeleteAccount(pendingDeleteId);
  deleteOverlay.classList.remove('open');
  pendingDeleteId = null;
  await refreshAccounts();
  startTick();
});

deleteOverlay.addEventListener('click', e => {
  if (e.target === deleteOverlay) {
    deleteOverlay.classList.remove('open');
    pendingDeleteId = null;
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
init();
