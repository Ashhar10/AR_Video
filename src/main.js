import { ThreeSceneManager } from './threeScene.js';
import { productsData } from './productsData.js';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';

let threeScene = null;
let currentSelectedProduct = null;
const LAN_IP = '192.168.88.80';

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('banner-video');
  const canvasContainer = document.getElementById('webgl-container');

  threeScene = new ThreeSceneManager(canvasContainer, video);

  initFullscreen(video);
  initFloatingViewControls();
  initVideoControls(video);
  initModeSwitcher();
  initARMode();
  initProductShelf(video);
  initQrModal();
  initVideoTimeSync(video);
});

// ========================================================
// 1. FULLSCREEN - INSTANT ON LOAD / REFRESH
// ========================================================
function initFullscreen(video) {
  const btnFsToggle = document.getElementById('btn-fullscreen-toggle');
  const iconFsEnter = document.getElementById('icon-fs-enter');
  const iconFsExit = document.getElementById('icon-fs-exit');
  const fsBanner = document.getElementById('fs-banner');
  const btnActivateFs = document.getElementById('btn-activate-fs');

  const isFs = () => !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );

  const updateUI = () => {
    if (isFs()) {
      if (iconFsEnter) iconFsEnter.classList.add('hidden');
      if (iconFsExit) iconFsExit.classList.remove('hidden');
      if (fsBanner) fsBanner.classList.add('hidden');
    } else {
      if (iconFsEnter) iconFsEnter.classList.remove('hidden');
      if (iconFsExit) iconFsExit.classList.add('hidden');
      if (fsBanner) fsBanner.classList.remove('hidden');
    }
  };

  // Try fullscreen immediately on load (works on desktop, PWA, and some mobile)
  requestAppFullscreen();

  // Start video immediately (muted for autoplay policy)
  video.muted = true;
  video.play().catch(() => {});

  // Collapse mobile browser address bar
  setTimeout(() => window.scrollTo(0, 1), 80);

  // On FIRST user gesture: go fullscreen + unmute audio
  const activateOnGesture = () => {
    if (!isFs()) requestAppFullscreen();
    if (video.muted) {
      video.muted = false;
      updateAudioIcon(true);
    }
    if (video.paused) video.play().catch(() => {});
    setTimeout(updateUI, 200);
  };

  document.addEventListener('click', activateOnGesture, { capture: true });
  document.addEventListener('touchend', activateOnGesture, { capture: true });

  if (btnActivateFs) {
    btnActivateFs.addEventListener('click', (e) => {
      e.stopPropagation();
      activateOnGesture();
    });
  }

  if (btnFsToggle) {
    btnFsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isFs()) exitAppFullscreen();
      else requestAppFullscreen();
      setTimeout(updateUI, 200);
    });
  }

  document.addEventListener('fullscreenchange', updateUI);
  document.addEventListener('webkitfullscreenchange', updateUI);
  document.addEventListener('mozfullscreenchange', updateUI);
  document.addEventListener('MSFullscreenChange', updateUI);

  setTimeout(updateUI, 300);
}

function requestAppFullscreen() {
  const elem = document.documentElement;
  try {
    if (elem.requestFullscreen) elem.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.mozRequestFullScreen) elem.mozRequestFullScreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
  } catch (e) {}
}

function exitAppFullscreen() {
  try {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  } catch (e) {}
}

// ========================================================
// 2. FLOATING VIEW & SCALE CONTROLS
// ========================================================
function initFloatingViewControls() {
  const btnUp = document.getElementById('btn-scale-up');
  const btnDown = document.getElementById('btn-scale-down');
  const btnReset = document.getElementById('btn-reset-view');
  if (btnUp) btnUp.addEventListener('click', () => { if (threeScene) threeScene.scaleUp(); });
  if (btnDown) btnDown.addEventListener('click', () => { if (threeScene) threeScene.scaleDown(); });
  if (btnReset) btnReset.addEventListener('click', () => { if (threeScene) threeScene.resetView(); });
}

// ========================================================
// 3. VIDEO CONTROLS
// ========================================================
function initVideoControls(video) {
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const btnReplay = document.getElementById('btn-replay');
  const btnAudio = document.getElementById('btn-audio-toggle');
  const timeDisplay = document.getElementById('time-display');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const speedSelector = document.getElementById('speed-selector');

  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      if (video.paused) video.play(); else video.pause();
    });
  }
  video.addEventListener('play', () => {
    if (iconPlay) iconPlay.classList.add('hidden');
    if (iconPause) iconPause.classList.remove('hidden');
  });
  video.addEventListener('pause', () => {
    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
  });
  if (btnReplay) btnReplay.addEventListener('click', () => { video.currentTime = 0; video.play(); });
  if (btnAudio) btnAudio.addEventListener('click', () => { video.muted = !video.muted; updateAudioIcon(!video.muted); });
  if (speedSelector) speedSelector.addEventListener('change', (e) => { video.playbackRate = parseFloat(e.target.value); });

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (timeDisplay) timeDisplay.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
  });

  if (progressContainer) {
    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (video.duration) video.currentTime = ratio * video.duration;
    });
  }
}

function updateAudioIcon(on) {
  const iconOn = document.getElementById('icon-sound-on');
  const iconOff = document.getElementById('icon-sound-off');
  if (iconOn && iconOff) {
    if (on) { iconOn.classList.remove('hidden'); iconOff.classList.add('hidden'); }
    else { iconOn.classList.add('hidden'); iconOff.classList.remove('hidden'); }
  }
}
function fmt(s) { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m<10?'0'+m:m}:${sec<10?'0'+sec:sec}`; }

// ========================================================
// 4. BANNER MODE SWITCHER
// ========================================================
function initModeSwitcher() {
  const buttons = document.querySelectorAll('.mode-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'ar') { launchARMode(); return; }
      if (threeScene && threeScene.isARActive) exitARMode();
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (threeScene) threeScene.setMode(mode);
    });
  });
}

// ========================================================
// 5. AR MODE CONTROLLER
// ========================================================
function initARMode() {
  const btnArQuick = document.getElementById('btn-ar-quick');
  const btnExitAr = document.getElementById('btn-exit-ar');
  const btnPlaceBanner = document.getElementById('btn-place-banner');
  const btnReposition = document.getElementById('btn-reposition-banner');

  if (btnArQuick) btnArQuick.addEventListener('click', () => launchARMode());
  if (btnExitAr) btnExitAr.addEventListener('click', () => exitARMode());
  if (btnPlaceBanner) {
    btnPlaceBanner.addEventListener('click', (e) => {
      e.stopPropagation();
      if (threeScene) threeScene.placeBannerOnSurface();
    });
  }
  if (btnReposition) {
    btnReposition.addEventListener('click', (e) => {
      e.stopPropagation();
      if (threeScene) {
        threeScene.repositionBanner();
        const placementBox = document.getElementById('ar-placement-box');
        if (placementBox) placementBox.classList.remove('hidden');
        if (btnReposition) btnReposition.classList.add('hidden');
        const ps = document.getElementById('ar-plane-status');
        const pst = document.getElementById('ar-plane-status-txt');
        if (ps) ps.className = 'ar-status-pill locked';
        if (pst) pst.textContent = 'Horizontal Surface Detected';
      }
    });
  }
}

function launchARMode() {
  // Ensure fullscreen for AR too
  requestAppFullscreen();

  const arHud = document.getElementById('ar-hud');
  const arModeBtn = document.querySelector('.mode-btn[data-mode="ar"]');
  const placementBox = document.getElementById('ar-placement-box');
  const btnReposition = document.getElementById('btn-reposition-banner');
  const planeStatus = document.getElementById('ar-plane-status');
  const planeStatusTxt = document.getElementById('ar-plane-status-txt');

  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  if (arModeBtn) arModeBtn.classList.add('active');
  if (arHud) arHud.classList.remove('hidden');
  if (placementBox) placementBox.classList.remove('hidden');
  if (btnReposition) btnReposition.classList.add('hidden');
  if (planeStatus) planeStatus.className = 'ar-status-pill scanning';
  if (planeStatusTxt) planeStatusTxt.textContent = 'Scanning for Horizontal Surface...';

  if (threeScene) {
    threeScene.startAR({
      onSuccess: () => console.log('AR started.'),
      onError: (err) => console.warn('AR camera fallback:', err),
      onPlaneDetected: () => {
        if (planeStatus) planeStatus.className = 'ar-status-pill locked';
        if (planeStatusTxt) planeStatusTxt.textContent = 'Horizontal Surface Detected';
        const guideText = document.getElementById('ar-guide-text');
        if (guideText) guideText.textContent = 'Tap screen or press button to place banner';
      },
      onBannerPlaced: () => {
        if (placementBox) placementBox.classList.add('hidden');
        if (btnReposition) btnReposition.classList.remove('hidden');
        if (planeStatusTxt) planeStatusTxt.textContent = 'Video Banner Anchored in World';
      }
    });
  }
}

function exitARMode() {
  const arHud = document.getElementById('ar-hud');
  if (arHud) arHud.classList.add('hidden');
  if (threeScene) threeScene.stopAR();
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const curvedBtn = document.querySelector('.mode-btn[data-mode="curved3d"]');
  if (curvedBtn) curvedBtn.classList.add('active');
}

// ========================================================
// 6. PRODUCT SHELF & MODAL
// ========================================================
function initProductShelf(video) {
  const shelfTrack = document.getElementById('shelf-track');
  const productShelf = document.getElementById('product-shelf');
  const btnToggleShelf = document.getElementById('btn-toggle-shelf');
  const shelfCloseBtn = document.getElementById('shelf-close-btn');
  const shelfBadgeCount = document.getElementById('shelf-badge-count');
  const btnPrev = document.getElementById('shelf-prev');
  const btnNext = document.getElementById('shelf-next');

  if (shelfBadgeCount) shelfBadgeCount.textContent = productsData.length;

  if (shelfTrack) {
    shelfTrack.innerHTML = productsData.map(p => `
      <div class="product-card" data-product-id="${p.id}">
        <span class="card-badge">${p.badge}</span>
        <img src="${p.image}" alt="${p.name}" class="card-jar-img" loading="lazy" />
        <h3 class="card-title">${p.name}</h3>
        <span class="card-weight">450g</span>
        <button class="card-action-btn" data-action="inspect">View Details</button>
      </div>
    `).join('');

    shelfTrack.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const product = productsData.find(p => p.id === card.dataset.productId);
        if (product) openProductModal(product, video);
      });
    });
  }

  const toggleShelf = (force) => {
    if (!productShelf || !btnToggleShelf) return;
    const collapse = typeof force === 'boolean' ? !force : !productShelf.classList.contains('collapsed');
    if (collapse) { productShelf.classList.add('collapsed'); btnToggleShelf.classList.remove('active'); }
    else { productShelf.classList.remove('collapsed'); btnToggleShelf.classList.add('active'); }
  };
  if (btnToggleShelf) btnToggleShelf.addEventListener('click', () => toggleShelf());
  if (shelfCloseBtn) shelfCloseBtn.addEventListener('click', () => toggleShelf(false));
  if (btnPrev && shelfTrack) btnPrev.addEventListener('click', () => shelfTrack.scrollBy({ left: -260, behavior: 'smooth' }));
  if (btnNext && shelfTrack) btnNext.addEventListener('click', () => shelfTrack.scrollBy({ left: 260, behavior: 'smooth' }));

  initProductModal(video);
}

function initProductModal(video) {
  const modal = document.getElementById('product-modal');
  const closeBtn = document.getElementById('modal-close');
  const btnJump = document.getElementById('btn-jump-video');
  const btnFav = document.getElementById('btn-favorite');
  if (!modal) return;
  const close = () => modal.classList.remove('active');
  if (closeBtn) closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  if (btnJump) {
    btnJump.addEventListener('click', () => {
      if (currentSelectedProduct && video) { video.currentTime = currentSelectedProduct.videoTimestamp; video.play(); close(); }
    });
  }
  if (btnFav) {
    btnFav.addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      confetti({ particleCount: 45, spread: 60, origin: { x: (rect.left+rect.width/2)/window.innerWidth, y: (rect.top+rect.height/2)/window.innerHeight }, colors: ['#f1c40f','#e74c3c','#2ecc71','#3498db'] });
      btnFav.innerHTML = '<span>Saved to Favorites</span>';
      setTimeout(() => { btnFav.innerHTML = '<span>Save Favorite</span>'; }, 2500);
    });
  }
}

function openProductModal(product, video) {
  currentSelectedProduct = product;
  const modal = document.getElementById('product-modal');
  if (!modal) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const jarImg = document.getElementById('modal-jar-img');
  if (jarImg) { jarImg.src = product.image; jarImg.alt = product.name; }
  const glow = document.getElementById('modal-glow-bg');
  if (glow) glow.style.background = product.accentColor;
  set('modal-badge', product.badge);
  set('modal-title', product.name);
  set('modal-subtitle', product.subtitle);
  set('modal-weight', `Net Wt: ${product.netWeight}`);
  set('modal-desc', product.description);
  const flavorC = document.getElementById('modal-flavor-tags');
  if (flavorC) flavorC.innerHTML = product.flavorProfile.map(f => `<span class="flavor-chip">${f}</span>`).join('');
  set('modal-fruit-content', product.nutrition.fruitContent);
  set('modal-energy', product.nutrition.energy);
  set('modal-ingredients', product.ingredients.join(', '));
  set('modal-pairing', product.pairing);
  modal.classList.add('active');
}

// ========================================================
// 7. QR CODE MODAL (HTTPS)
// ========================================================
function initQrModal() {
  const btnOpenQr = document.getElementById('btn-open-qr');
  const qrModal = document.getElementById('qr-modal');
  const qrCloseBtn = document.getElementById('qr-modal-close');
  const qrCanvas = document.getElementById('qr-canvas');
  const qrInput = document.getElementById('qr-url-input');
  const btnCopy = document.getElementById('btn-copy-url');

  const PRODUCTION_URL = 'https://arvideoweb.vercel.app/';
  let targetUrl = PRODUCTION_URL;
  if (window.location.hostname.includes('vercel.app')) {
    targetUrl = window.location.origin + '/';
  }
  if (qrInput) qrInput.value = targetUrl;

  const gen = () => {
    if (!qrCanvas) return;
    QRCode.toCanvas(qrCanvas, targetUrl, { width: 220, margin: 1, color: { dark: '#11141c', light: '#ffffff' } }, (err) => { if (err) console.error(err); });
  };
  if (btnOpenQr && qrModal) btnOpenQr.addEventListener('click', () => { gen(); qrModal.classList.add('active'); });
  if (qrCloseBtn && qrModal) qrCloseBtn.addEventListener('click', () => qrModal.classList.remove('active'));
  if (qrModal) qrModal.addEventListener('click', (e) => { if (e.target === qrModal) qrModal.classList.remove('active'); });
  if (btnCopy) btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(targetUrl).then(() => { btnCopy.textContent = 'Copied'; setTimeout(() => { btnCopy.textContent = 'Copy Link'; }, 2000); });
  });
}

// ========================================================
// 8. TIME-SYNCED SCENE INDICATORS
// ========================================================
function initVideoTimeSync(video) {
  const tag = document.getElementById('scene-tag-text');
  if (!tag) return;
  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    if (t < 2.5) tag.textContent = 'Ripe Raspberries';
    else if (t < 6.5) tag.textContent = 'Fruit to Jam Transformation';
    else if (t < 8.5) tag.textContent = 'Ahmed Raspberry Jam 450g';
    else tag.textContent = '9 Flagship Jars Lineup';
  });
}
