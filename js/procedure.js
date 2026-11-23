// Pure logic for the 13-step Franke A600 cleaning procedure.
// No DOM / WebGL in here, so it can be unit-tested in Node.

export const STEPS = [
  { n: 1, title: 'Tap the Franke logo.' },
  { n: 2, title: 'Enter the PIN.' },
  { n: 3, title: 'Press OK.' },
  { n: 4, title: 'Select Cleaning and maintenance.' },
  { n: 5, title: 'Select Clean coffee machine.' },
  { n: 6, title: 'Confirm message with Yes.' },
  { n: 7, title: 'Follow on-screen instructions and select Next.' },
  { n: 8, title: 'Disassemble milk container and lid.' },
  { n: 9, title: 'Detach milk suction hose and fitting.' },
  { n: 10, title: 'Empty bean and powder hoppers.' },
  { n: 11, title: 'Clean all disassembled parts using 5-step method.' },
  { n: 12, title: 'Assemble milk container and lid.' },
  { n: 13, title: 'Attach milk suction hose and fitting.' },
];

// Friendly names for the results screen.
export const ACTION_LABELS = {
  'screen:drink': 'Selected a drink on the touchscreen',
  'screen:power': 'Pressed the power button',
  'screen:menu_settings': 'Opened My settings',
  'screen:menu_indiv': 'Opened Individualization and data transfer',
  'screen:cmenu_log': 'Opened Error/Event log',
  'screen:cmenu_rinse': 'Selected Rinse coffee machine',
  'screen:cmenu_filter': 'Selected Filter water quantity',
  'screen:cmenu_wipe': 'Selected Wipe protection',
  'screen:confirm_no': 'Answered No to the cleaning prompt',
  'screen:pin_wrong': 'Entered the wrong PIN',
  'screen:pin_ok_invalid': 'Pressed OK before a valid PIN was entered',
  'screen:pin_complete': 'Out-of-order screen action',
  'part:container': 'Handled the milk container at the wrong time',
  'part:lid': 'Handled the milk container lid at the wrong time',
  'part:hose': 'Handled the milk suction hose at the wrong time',
  'part:hopper_bean_l': 'Emptied/handled the left bean hopper at the wrong time',
  'part:hopper_bean_r': 'Emptied/handled the right bean hopper at the wrong time',
  'part:hopper_powder': 'Emptied/handled the powder hopper at the wrong time',
  'part:sink': 'Used the wash station at the wrong time',
  'part:chamber': 'Touched the inside of the cooling chamber',
  'part:drip_tray': 'Touched the drip tray',
  'part:grounds': 'Touched the grounds drawer',
  'part:outlet': 'Touched the beverage outlet',
  'part:brew_door': 'Touched the front service door',
  'panel:selection': 'Chose the wrong set of parts to clean',
  'panel:method': 'Wrong order in the 5-step cleaning method',
};

// Screen events that make up the on-path navigation, mapped to the step they satisfy.
const SCREEN_PATH = {
  logo: 1,
  pin_complete: 2,
  pin_ok: 3,
  menu_cleaning: 4,
  cmenu_clean: 5,
  confirm_yes: 6,
  wizard_done: 7,
};
// Harmless UI movement that never counts for or against the user.
const SCREEN_NEUTRAL = new Set([
  'pin_digit', 'pin_back', 'pin_cancel', 'wizard_next', 'cmenu_back', 'nav',
]);

export const METHOD_ORDER = ['dirt', 'soak', 'wash', 'rinse', 'dry'];
export const METHOD_LABELS = {
  dirt: 'Remove loose dirt',
  soak: 'Soak with hot water and mild cleaner',
  wash: 'Wash',
  rinse: 'Rinse thoroughly',
  dry: 'Dry thoroughly',
};

// Everything the 5-step method applies to (from step 11 of the PDF), plus decoys.
export const PART_CHOICES = {
  chamber: 'Inner surfaces of the cooling chamber',
  door: 'Inner side of the door and lip seal',
  container_lid: 'Milk container and lid',
  hose: 'Milk suction hose and suction fitting',
  bean_hopper: 'Bean hopper',
  powder_hopper: 'Powder hoppers',
  adapters: 'Reversible adapters',
  brew_unit: 'Brew unit',
  drip_tray: 'Drip tray',
  grounds: 'Grounds drawer',
  touchscreen: 'Touchscreen',
};

export function correctParts(unit) {
  const base = ['chamber', 'door', 'container_lid', 'hose', 'bean_hopper', 'powder_hopper'];
  if (unit === 'SU12') base.push('adapters'); // "If your model is SU12, also clean the reversible adapters"
  return base;
}

const HOPPERS = ['bean_l', 'bean_r', 'powder'];

export class Procedure {
  constructor(cfg = {}, clock = () => performance.now()) {
    this.cfg = cfg;
    this.clock = clock;
    this.reset();
  }

  reset() {
    this.started = false;
    this.done = false;
    this.step = 1;
    this.t0 = 0;
    this.stepStart = 0;
    this.totalMs = 0;
    this.hintsUsed = 0;
    this.totalWrong = 0;
    this.events = [];
    this.log = STEPS.map((s) => ({ n: s.n, wrong: 0, ms: null }));
    this.phys = {
      doorOpen: false,
      containerOut: false,
      lidOn: true,
      hoseOn: true,
      hoppers: { bean_l: false, bean_r: false, powder: false },
      cleaned: false,
    };
    this.panel = { phase: 'select', methodIdx: 0 };
  }

  start() {
    this.started = true;
    this.t0 = this.clock();
    this.stepStart = this.t0;
  }

  elapsed() {
    if (!this.started) return 0;
    return (this.done ? this.t0 + this.totalMs : this.clock()) - this.t0;
  }

  hint() {
    if (this.done) return '';
    this.hintsUsed += 1;
    return STEPS[this.step - 1].title;
  }

  // ---- result helpers ------------------------------------------------------
  _record(kind, outcome) {
    this.events.push({ t: this.clock() - this.t0, step: this.step, kind, outcome });
  }
  _wrong(kind) {
    this._record(kind, 'wrong');
    this.log[this.step - 1].wrong += 1;
    this.totalWrong += 1;
    return { outcome: 'wrong', effect: null, completed: null };
  }
  _neutral(kind, effect = null) {
    this._record(kind, 'neutral');
    return { outcome: 'neutral', effect, completed: null };
  }
  _ok(kind, effect = null, completedStep = null) {
    this._record(kind, 'ok');
    return { outcome: 'ok', effect, completed: completedStep };
  }
  _complete(n) {
    const now = this.clock();
    this.log[n - 1].ms = now - this.stepStart;
    this.stepStart = now;
    this.step = n + 1;
    if (n === STEPS.length) {
      this.done = true;
      this.totalMs = now - this.t0;
    }
    return n;
  }

  // ---- touchscreen ---------------------------------------------------------
  handleScreen(id) {
    if (!this.started || this.done) return this._neutral('screen:' + id);
    if (SCREEN_NEUTRAL.has(id)) return this._neutral('screen:' + id);
    const s = SCREEN_PATH[id];
    if (s === undefined) return this._wrong('screen:' + id);
    if (s === this.step) return this._ok('screen:' + id, null, this._complete(s));
    if (s < this.step) return this._neutral('screen:' + id); // re-navigating after a detour
    return this._wrong('screen:' + id);
  }

  // ---- 3D parts ------------------------------------------------------------
  // Returns { outcome, effect, completed }. `effect` names what the scene should animate.
  handlePart(id) {
    const kind = 'part:' + id;
    if (!this.started || this.done) return { outcome: 'neutral', effect: null, completed: null };
    const p = this.phys;
    const step = this.step;

    switch (id) {
      case 'door': {
        p.doorOpen = !p.doorOpen;
        return this._neutral(kind, p.doorOpen ? 'door_open' : 'door_close');
      }

      case 'container': {
        if (!p.containerOut) {
          if (!p.doorOpen) return this._neutral(kind);
          if (step === 8) {
            p.containerOut = true;
            return this._ok(kind, 'container_out', this._check8());
          }
          return this._wrong(kind);
        }
        // container is on the counter: putting it back is only sensible with the lid on
        if (p.lidOn && (step === 8 || step >= 12)) {
          p.containerOut = false;
          return this._neutral(kind, 'container_in');
        }
        return this._wrong(kind);
      }

      case 'lid': {
        if (p.lidOn) {
          if (step === 8) {
            p.lidOn = false;
            return this._ok(kind, 'lid_off', this._check8());
          }
          return this._wrong(kind);
        }
        if (step === 8) {
          p.lidOn = true; // undo
          return this._neutral(kind, 'lid_on');
        }
        if (step === 12 && p.containerOut) {
          p.lidOn = true;
          return this._ok(kind, 'lid_on', this._complete(12));
        }
        return this._wrong(kind);
      }

      case 'hose': {
        if (p.hoseOn) {
          if (step === 9 && !p.lidOn) {
            p.hoseOn = false;
            return this._ok(kind, 'hose_off', this._complete(9));
          }
          return this._wrong(kind);
        }
        if (step === 13 && p.lidOn) {
          p.hoseOn = true;
          return this._ok(kind, 'hose_on', this._complete(13));
        }
        return this._wrong(kind);
      }

      case 'hopper_bean_l':
      case 'hopper_bean_r':
      case 'hopper_powder': {
        const key = id.replace('hopper_', '');
        if (p.hoppers[key]) return this._neutral(kind); // already empty
        if (step === 10) {
          p.hoppers[key] = true;
          const all = HOPPERS.every((k) => p.hoppers[k]);
          return this._ok(kind, 'empty_' + key, all ? this._complete(10) : null);
        }
        return this._wrong(kind);
      }

      case 'sink': {
        if (step === 11) return this._neutral(kind, 'open_panel');
        if (p.cleaned) return this._neutral(kind);
        return this._wrong(kind);
      }

      default:
        // drip tray, grounds drawer, outlet, service door ... not part of this procedure
        return this._wrong(kind);
    }
  }

  _check8() {
    const p = this.phys;
    if (this.step === 8 && p.containerOut && !p.lidOn) return this._complete(8);
    return null;
  }

  // ---- wash station panel (step 11) ----------------------------------------
  submitSelection(ids) {
    if (this.step !== 11) return { ok: false };
    const want = new Set(correctParts(this.cfg.coolingUnit));
    const got = new Set(ids);
    const ok = want.size === got.size && [...want].every((x) => got.has(x));
    if (!ok) {
      this._wrong('panel:selection');
      return { ok: false };
    }
    this._record('panel:selection', 'ok');
    this.panel.phase = 'method';
    this.panel.methodIdx = 0;
    return { ok: true };
  }

  tapMethod(id) {
    if (this.step !== 11 || this.panel.phase !== 'method') return { ok: false, finished: false };
    if (id === METHOD_ORDER[this.panel.methodIdx]) {
      this.panel.methodIdx += 1;
      if (this.panel.methodIdx >= METHOD_ORDER.length) {
        this.phys.cleaned = true;
        this._record('panel:method', 'ok');
        this._complete(11);
        return { ok: true, finished: true };
      }
      return { ok: true, finished: false };
    }
    this._wrong('panel:method');
    return { ok: false, finished: false };
  }

  summary() {
    const wrongEvents = this.events
      .filter((e) => e.outcome === 'wrong')
      .map((e) => ({ step: e.step, kind: e.kind, label: ACTION_LABELS[e.kind] || e.kind }));
    return {
      done: this.done,
      totalMs: this.done ? this.totalMs : this.elapsed(),
      totalWrong: this.totalWrong,
      hintsUsed: this.hintsUsed,
      steps: STEPS.map((s, i) => ({ n: s.n, title: s.title, wrong: this.log[i].wrong, ms: this.log[i].ms })),
      wrongEvents,
    };
  }
}
