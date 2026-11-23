// The A600's 8" touchscreen, drawn on a 2D canvas that is mapped onto the 3D model.
// The screen follows its own natural navigation and only reports *what was tapped*
// through onEvent({ id }). Judging right or wrong is the Procedure's job.

export const SCREEN_W = 800;
export const SCREEN_H = 480;

const FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
const GOLD = '#c99a3b';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, o = {}) {
  ctx.font = `${o.weight || 400} ${o.size || 22}px ${FONT}`;
  ctx.fillStyle = o.color || '#e9e5de';
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'middle';
  if (o.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = o.spacing + 'px';
  ctx.fillText(str, x, y);
  if (o.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

// ---- small vector icons ---------------------------------------------------
function drawCup(ctx, cx, cy, kind) {
  ctx.save();
  ctx.translate(cx, cy);
  if (kind === 'tall') {
    // tall latte-style glass
    const g = ctx.createLinearGradient(0, -50, 0, 50);
    g.addColorStop(0, '#f1dfb8');
    g.addColorStop(0.35, '#d7b57a');
    g.addColorStop(0.6, '#8a5a34');
    g.addColorStop(1, '#5a3520');
    ctx.fillStyle = g;
    rr(ctx, -26, -44, 52, 92, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    rr(ctx, -26, -44, 52, 92, 8);
    ctx.stroke();
    ctx.fillStyle = '#f6e9c9';
    ctx.beginPath();
    ctx.ellipse(0, -46, 28, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const liquid = kind === 'tea' ? '#9b3a14' : kind === 'brewed' ? '#1c1109' : kind === 'espresso' ? '#120b06' : '#e9d3a2';
    const wide = kind === 'espresso' ? 0.8 : 1;
    // saucer
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(0, 40, 62 * wide, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // handle
    ctx.strokeStyle = 'rgba(235,235,235,0.75)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(46 * wide, 5, 15, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // body
    const bodyCol = kind === 'tea' ? 'rgba(220,225,230,0.35)' : '#e8e6e2';
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(-48 * wide, -14);
    ctx.lineTo(48 * wide, -14);
    ctx.quadraticCurveTo(44 * wide, 40, 0, 40);
    ctx.quadraticCurveTo(-44 * wide, 40, -48 * wide, -14);
    ctx.fill();
    // liquid surface
    ctx.fillStyle = liquid;
    ctx.beginPath();
    ctx.ellipse(0, -14, 48 * wide, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'cappuccino') {
      ctx.fillStyle = '#f7ead0';
      ctx.beginPath();
      ctx.ellipse(0, -22, 40, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGear(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r * 0.18, -r, r * 0.36, r * 0.4);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2d31';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPower(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r - 2);
  ctx.lineTo(cx, cy - 2);
  ctx.stroke();
  ctx.restore();
}

function wordmark(ctx, x, y, size = 20) {
  text(ctx, 'FRANKE', x, y, { size, weight: 800, color: 'rgba(235,235,235,0.78)', spacing: size * 0.18 });
}

export class Touchscreen {
  constructor(cfg = {}, onEvent = null) {
    this.cfg = cfg;
    this.onEvent = onEvent;
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = this.canvas.getContext('2d');
    this.dirty = true;
    this.reset();
    this.draw();
  }

  reset() {
    this.screen = 'home';
    this.pin = '';
    this.pressed = null; // { id, t }
    this.shake = 0;
    this.wizardPage = 0;
    this.wizardProgress = 0;
    this.stub = { title: '', message: '', back: 'home' };
    this.dirty = true;
  }

  // ---- layout (shared by drawing and hit-testing) ---------------------------
  regions() {
    const R = [];
    const add = (id, x, y, w, h, extra = {}) => R.push({ id, x, y, w, h, ...extra });

    switch (this.screen) {
      case 'home': {
        add('logo', 10, 6, 190, 54);
        add('nav', 4, 190, 56, 100);
        add('nav', 740, 190, 56, 100);
        const cols = [70, 290, 510];
        const rows = [66, 258];
        const tiles = [
          ['drink', 0, 0, 'Espresso', 'espresso', false],
          ['drink', 1, 0, 'Cappuccino', 'cappuccino', true],
          ['drink', 2, 0, 'Chococcino', 'tall', true],
          ['drink', 0, 1, 'Brewed Coffee', 'brewed', false],
          ['drink', 1, 1, 'Chocolate', 'tall', true],
          ['drink', 2, 1, 'Tea', 'tea', false],
        ];
        tiles.forEach(([id, c, r, label, icon, gold]) =>
          add(id, cols[c], rows[r], 216, 186, { label, icon, gold }));
        break;
      }
      case 'pin': {
        add('pin_cancel', 14, 14, 120, 44, { label: '‹  Back' });
        const x0 = 250, y0 = 160, bw = 90, bh = 66, gap = 10;
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
        keys.forEach((k, i) => {
          const c = i % 3, r = Math.floor(i / 3);
          add('key_' + k, x0 + c * (bw + gap), y0 + r * (bh + gap), bw, bh, { key: k });
        });
        break;
      }
      case 'menu': {
        add('nav', 170, 8, 70, 44, { label: '‹' });
        const labels = [
          ['menu_settings', 'My settings', 'gear'],
          ['menu_indiv', 'Individualization and data transfer', 'screens'],
          ['menu_cleaning', 'Cleaning and maintenance', 'clean'],
        ];
        labels.forEach(([id, label, icon], i) => add(id, 190, 100 + i * 80, 420, 70, { label, icon }));
        add('power', 372, 380, 56, 56);
        break;
      }
      case 'cmenu': {
        const items = [
          ['cmenu_log', 'Error/Event log'],
          ['cmenu_clean', 'Clean Coffee Machine'],
          ['cmenu_rinse', 'Rinse Coffee Machine'],
          ['cmenu_filter', 'Filter water quantity'],
          ['cmenu_wipe', 'Wipe Protection'],
        ];
        items.forEach(([id, label], i) => add(id, 40, 150 + i * 54, 330, 48, { label }));
        add('cmenu_back', 40, 428, 150, 40, { label: '‹  Back' });
        break;
      }
      case 'confirm': {
        add('confirm_yes', 200, 290, 190, 54, { label: 'Yes' });
        add('confirm_no', 410, 290, 190, 54, { label: 'No' });
        break;
      }
      case 'wizard': {
        const ready = this.wizardProgress >= 1;
        add('wizard_next', 560, 392, 210, 58, { label: 'Next', disabled: !ready });
        break;
      }
      case 'stub': {
        add('stub_back', 300, 372, 200, 56, { label: '‹  Back' });
        break;
      }
      default:
        break;
    }
    return R;
  }

  regionAt(x, y) {
    const rs = this.regions();
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // ---- input ----------------------------------------------------------------
  emit(id) {
    if (this.onEvent) this.onEvent({ id });
  }

  press(id) {
    this.pressed = { id, t: 0.18 };
    this.dirty = true;
  }

  goStub(title, message, back) {
    this.stub = { title, message, back };
    this.screen = 'stub';
  }

  pointer(x, y) {
    const r = this.regionAt(x, y);
    if (!r || r.disabled) return;
    this.press(r.id + (r.key ? ':' + r.key : '') + (r.label || ''));
    this._lastPressKey = r.id + (r.key ? ':' + r.key : '') + (r.label || '');

    switch (this.screen) {
      case 'home': {
        if (r.id === 'logo') {
          this.pin = '';
          this.screen = 'pin';
          this.emit('logo');
        } else if (r.id === 'drink') {
          this.emit('drink');
          this.goStub(r.label, 'Please place a cup.', 'home');
        }
        break;
      }
      case 'pin': {
        if (r.id === 'pin_cancel') {
          this.screen = 'home';
          this.pin = '';
          this.emit('pin_cancel');
        } else if (r.key === 'back') {
          this.pin = this.pin.slice(0, -1);
          this.emit('pin_back');
        } else if (r.key === 'ok') {
          const len = this.cfg.pinLength || 4;
          const valid = this.pin.length === len && (!this.cfg.strictPin || this.pin === this.cfg.pin);
          if (valid) {
            this.screen = 'menu';
            this.emit('pin_ok');
          } else {
            this.shake = 0.4;
            this.emit('pin_ok_invalid');
          }
        } else {
          const len = this.cfg.pinLength || 4;
          if (this.pin.length < len) {
            this.pin += r.key;
            this.emit('pin_digit');
            if (this.pin.length === len) {
              if (this.cfg.strictPin && this.pin !== this.cfg.pin) {
                this.shake = 0.4;
                this.pin = '';
                this.emit('pin_wrong');
              } else {
                this.emit('pin_complete');
              }
            }
          }
        }
        break;
      }
      case 'menu': {
        if (r.id === 'nav') {
          this.screen = 'home';
          this.emit('nav');
        } else if (r.id === 'menu_cleaning') {
          this.screen = 'cmenu';
          this.emit('menu_cleaning');
        } else if (r.id === 'menu_settings' || r.id === 'menu_indiv') {
          this.emit(r.id);
          this.goStub(r.label, 'Not available in this exercise.', 'menu');
        } else if (r.id === 'power') {
          this.emit('power');
          this.goStub('Power', 'Not available in this exercise.', 'menu');
        }
        break;
      }
      case 'cmenu': {
        if (r.id === 'cmenu_back') {
          this.screen = 'menu';
          this.emit('cmenu_back');
        } else if (r.id === 'cmenu_clean') {
          this.screen = 'confirm';
          this.emit('cmenu_clean');
        } else {
          this.emit(r.id);
          this.goStub(r.label, 'Not available in this exercise.', 'cmenu');
        }
        break;
      }
      case 'confirm': {
        if (r.id === 'confirm_yes') {
          this.screen = 'wizard';
          this.wizardPage = 0;
          this.wizardProgress = 0;
          this.emit('confirm_yes');
        } else {
          this.screen = 'cmenu';
          this.emit('confirm_no');
        }
        break;
      }
      case 'wizard': {
        if (r.id === 'wizard_next') {
          if (this.wizardPage < 2) {
            this.wizardPage += 1;
            this.wizardProgress = this.wizardPage === 2 ? 1 : 0;
            this.emit('wizard_next');
          } else {
            this.screen = 'locked';
            this.emit('wizard_done');
          }
        }
        break;
      }
      case 'stub': {
        this.screen = this.stub.back || 'home';
        this.emit('nav');
        break;
      }
      default:
        break;
    }
    this.dirty = true;
  }

  showComplete() {
    this.screen = 'complete';
    this.dirty = true;
  }

  // ---- animation tick -------------------------------------------------------
  update(dt) {
    if (this.pressed) {
      this.pressed.t -= dt;
      if (this.pressed.t <= 0) this.pressed = null;
      this.dirty = true;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.dirty = true;
    }
    if (this.screen === 'wizard' && this.wizardPage < 2 && this.wizardProgress < 1) {
      this.wizardProgress = Math.min(1, this.wizardProgress + dt / 1.4);
      this.dirty = true;
    }
    if (this.dirty) {
      this.draw();
      return true;
    }
    return false;
  }

  // ---- drawing --------------------------------------------------------------
  isPressed(r) {
    return this.pressed && this._lastPressKey === r.id + (r.key ? ':' + r.key : '') + (r.label || '');
  }

  draw() {
    const ctx = this.ctx;
    this.dirty = false;
    const g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
    g.addColorStop(0, '#17130f');
    g.addColorStop(1, '#0c0a08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // faint vertical texture like the real UI
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 0; x < SCREEN_W; x += 32) ctx.fillRect(x, 0, 1, SCREEN_H);

    switch (this.screen) {
      case 'home': return this.drawHome();
      case 'pin': return this.drawPin();
      case 'menu': return this.drawMenu();
      case 'cmenu': return this.drawCleaningMenu();
      case 'confirm': return this.drawConfirm();
      case 'wizard': return this.drawWizard();
      case 'stub': return this.drawStub();
      case 'locked': return this.drawMessage('Cleaning mode', 'The machine is not available for beverages.', '#e9e5de');
      case 'complete': return this.drawMessage('Cleaning completed', 'The machine is ready for operation.', '#8fd19e', true);
      default: return undefined;
    }
  }

  clock(ctx) {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    text(ctx, `${hh}:${mm}`, 770, 20, { size: 15, align: 'right', color: '#d9d4cb' });
    text(ctx, date, 770, 38, { size: 15, align: 'right', color: '#d9d4cb' });
  }

  drawHome() {
    const ctx = this.ctx;
    wordmark(ctx, 22, 32, 20);
    // page dots
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 3 ? '#ffffff' : 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.arc(372 + i * 14, 20, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // orange corner
    ctx.fillStyle = '#e8892b';
    ctx.beginPath();
    ctx.moveTo(SCREEN_W - 44, 0);
    ctx.lineTo(SCREEN_W, 0);
    ctx.lineTo(SCREEN_W, 44);
    ctx.closePath();
    ctx.fill();
    this.clock(ctx);
    // arrows
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.moveTo(28, 226); ctx.lineTo(28, 254); ctx.lineTo(14, 240); ctx.fill();
    ctx.beginPath(); ctx.moveTo(772, 226); ctx.lineTo(772, 254); ctx.lineTo(786, 240); ctx.fill();

    this.regions().filter((r) => r.id === 'drink').forEach((r) => {
      if (r.gold) {
        ctx.fillStyle = 'rgba(168,118,28,0.55)';
        ctx.fillRect(r.x, r.y, r.w - 2, r.h - 2);
        ctx.strokeStyle = 'rgba(232,190,100,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 4, r.h - 4);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(r.x, r.y, r.w - 2, r.h - 2);
      }
      if (this.isPressed(r)) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(r.x, r.y, r.w - 2, r.h - 2);
      }
      drawCup(ctx, r.x + r.w / 2, r.y + 78, r.icon);
      text(ctx, r.label, r.x + r.w / 2, r.y + r.h - 22, { size: 20, align: 'center', weight: 500, color: r.gold ? '#f4e2b8' : '#e9e5de' });
    });
  }

  drawPin() {
    const ctx = this.ctx;
    const regions = this.regions();
    const cancel = regions.find((r) => r.id === 'pin_cancel');
    ctx.fillStyle = this.isPressed(cancel) ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    rr(ctx, cancel.x, cancel.y, cancel.w, cancel.h, 8); ctx.fill();
    text(ctx, cancel.label, cancel.x + cancel.w / 2, cancel.y + cancel.h / 2, { size: 20, align: 'center' });

    text(ctx, 'Enter PIN', 400, 52, { size: 28, align: 'center', weight: 600 });
    const dx = this.shake > 0 ? Math.sin(this.shake * 70) * 10 : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, 250 + dx, 82, 290, 56, 10); ctx.fill();
    ctx.strokeStyle = this.shake > 0 ? '#d9534f' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    rr(ctx, 250 + dx, 82, 290, 56, 10); ctx.stroke();
    const len = this.cfg.pinLength || 4;
    for (let i = 0; i < len; i++) {
      const cx = 250 + dx + 145 + (i - (len - 1) / 2) * 44;
      ctx.fillStyle = i < this.pin.length ? '#ffffff' : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(cx, 110, i < this.pin.length ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
    }

    regions.filter((r) => r.key).forEach((r) => {
      const isOk = r.key === 'ok';
      ctx.fillStyle = this.isPressed(r)
        ? 'rgba(255,255,255,0.3)'
        : isOk ? 'rgba(168,118,28,0.75)' : 'rgba(255,255,255,0.1)';
      rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
      ctx.strokeStyle = isOk ? 'rgba(232,190,100,0.9)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();
      const label = r.key === 'back' ? '⌫' : r.key === 'ok' ? 'OK' : r.key;
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: isOk ? 26 : 30, align: 'center', weight: 600 });
    });
  }

  drawMenu() {
    const ctx = this.ctx;
    wordmark(ctx, 22, 32, 20);
    this.clock(ctx);
    text(ctx, 'Menu', 400, 62, { size: 26, align: 'center', weight: 600 });
    this.regions().forEach((r) => {
      if (r.id === 'power') {
        ctx.fillStyle = this.isPressed(r) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 28, 0, Math.PI * 2); ctx.fill();
        drawPower(ctx, r.x + r.w / 2, r.y + r.h / 2 + 1, 12, '#e9e5de');
        return;
      }
      if (r.id === 'nav') {
        text(ctx, '‹', r.x + 30, r.y + 20, { size: 40, weight: 300, color: 'rgba(255,255,255,0.55)', align: 'center' });
        return;
      }
      ctx.fillStyle = this.isPressed(r) ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
      rr(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      rr(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
      if (r.icon === 'gear') drawGear(ctx, r.x + 34, r.y + r.h / 2, 14, '#e9e5de');
      else if (r.icon === 'screens') {
        ctx.fillStyle = '#e9e5de';
        ctx.fillRect(r.x + 20, r.y + 24, 20, 16);
        ctx.fillStyle = '#9a958d';
        ctx.fillRect(r.x + 28, r.y + 32, 20, 16);
      } else {
        ctx.fillStyle = '#e9e5de';
        rr(ctx, r.x + 20, r.y + 22, 28, 26, 4); ctx.fill();
        ctx.fillStyle = '#2b2d31';
        ctx.fillRect(r.x + 25, r.y + 28, 4, 14);
        ctx.fillRect(r.x + 33, r.y + 28, 4, 14);
        ctx.fillRect(r.x + 41, r.y + 28, 4, 14);
      }
      text(ctx, r.label, r.x + 68, r.y + r.h / 2, { size: 21 });
    });
  }

  drawCleaningMenu() {
    const ctx = this.ctx;
    // top bar with logo and status icons
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, SCREEN_W, 52);
    wordmark(ctx, 22, 27, 18);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(250 + i * 58, 26, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, 'Cleaning and maintenance', 40, 104, { size: 28, weight: 500 });
    this.regions().forEach((r) => {
      if (r.id === 'cmenu_back') {
        ctx.fillStyle = this.isPressed(r) ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
        rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        text(ctx, r.label, r.x + r.w / 2, r.y + r.h / 2, { size: 18, align: 'center' });
        return;
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y - 2);
      ctx.lineTo(r.x + r.w, r.y - 2);
      ctx.stroke();
      ctx.fillStyle = this.isPressed(r) ? 'rgba(120,150,190,0.55)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      text(ctx, r.label, r.x + 6, r.y + r.h / 2, { size: 19 });
    });
  }

  drawConfirm() {
    const ctx = this.ctx;
    this.drawCleaningMenuBackdrop();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#26282c';
    rr(ctx, 150, 120, 500, 250, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    rr(ctx, 150, 120, 500, 250, 14); ctx.stroke();
    text(ctx, 'Start the cleaning process?', 400, 180, { size: 28, align: 'center', weight: 600 });
    text(ctx, 'The machine is not available during cleaning.', 400, 228, { size: 18, align: 'center', color: '#bdb8af' });
    this.regions().forEach((r) => {
      const yes = r.id === 'confirm_yes';
      ctx.fillStyle = this.isPressed(r) ? 'rgba(255,255,255,0.3)' : yes ? 'rgba(168,118,28,0.75)' : 'rgba(255,255,255,0.1)';
      rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
      ctx.strokeStyle = yes ? 'rgba(232,190,100,0.9)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.5;
      rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();
      text(ctx, r.label, r.x + r.w / 2, r.y + r.h / 2, { size: 24, align: 'center', weight: 600 });
    });
  }

  drawCleaningMenuBackdrop() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, SCREEN_W, 52);
    wordmark(ctx, 22, 27, 18);
    text(ctx, 'Cleaning and maintenance', 40, 104, { size: 28, weight: 500 });
  }

  drawWizard() {
    const ctx = this.ctx;
    const titles = ['Cleaning: coffee machine', 'Cleaning: cooling unit', 'Cleaning finished'];
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, SCREEN_W, 52);
    wordmark(ctx, 22, 27, 18);
    text(ctx, titles[this.wizardPage], 400, 130, { size: 32, align: 'center', weight: 600 });
    if (this.wizardPage < 2) {
      const ready = this.wizardProgress >= 1;
      text(ctx, ready ? 'Done. Select Next to continue.' : 'Automatic cleaning in progress…', 400, 186, {
        size: 20, align: 'center', color: '#bdb8af',
      });
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      rr(ctx, 150, 236, 500, 20, 10); ctx.fill();
      ctx.fillStyle = ready ? '#8fd19e' : GOLD;
      rr(ctx, 150, 236, Math.max(20, 500 * this.wizardProgress), 20, 10); ctx.fill();
    } else {
      text(ctx, 'Select Next to continue.', 400, 186, { size: 20, align: 'center', color: '#bdb8af' });
      ctx.fillStyle = '#8fd19e';
      ctx.beginPath(); ctx.arc(400, 270, 34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10130f';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(384, 270); ctx.lineTo(396, 283); ctx.lineTo(418, 256); ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === this.wizardPage ? '#ffffff' : 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(372 + i * 28, 430, 5, 0, Math.PI * 2); ctx.fill();
    }
    const next = this.regions().find((r) => r.id === 'wizard_next');
    ctx.fillStyle = next.disabled ? 'rgba(255,255,255,0.05)' : this.isPressed(next) ? 'rgba(255,255,255,0.3)' : 'rgba(168,118,28,0.75)';
    rr(ctx, next.x, next.y, next.w, next.h, 10); ctx.fill();
    ctx.strokeStyle = next.disabled ? 'rgba(255,255,255,0.1)' : 'rgba(232,190,100,0.9)';
    ctx.lineWidth = 1.5;
    rr(ctx, next.x, next.y, next.w, next.h, 10); ctx.stroke();
    text(ctx, 'Next  ›', next.x + next.w / 2, next.y + next.h / 2, {
      size: 24, align: 'center', weight: 600, color: next.disabled ? 'rgba(255,255,255,0.3)' : '#fff',
    });
  }

  drawStub() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, SCREEN_W, 52);
    wordmark(ctx, 22, 27, 18);
    text(ctx, this.stub.title, 400, 170, { size: 32, align: 'center', weight: 600 });
    text(ctx, this.stub.message, 400, 230, { size: 21, align: 'center', color: '#bdb8af' });
    const b = this.regions()[0];
    ctx.fillStyle = this.isPressed(b) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
    rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, { size: 22, align: 'center' });
  }

  drawMessage(title, sub, color, tick = false) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, SCREEN_W, 52);
    wordmark(ctx, 22, 27, 18);
    if (tick) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(400, 170, 40, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10130f';
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(381, 170); ctx.lineTo(394, 184); ctx.lineTo(420, 154); ctx.stroke();
    }
    text(ctx, title, 400, tick ? 262 : 210, { size: 34, align: 'center', weight: 600, color });
    text(ctx, sub, 400, tick ? 310 : 260, { size: 21, align: 'center', color: '#bdb8af' });
  }
}
