// Wash-station overlay (step 11). It lists only the items that need washing; tap each one
// to wash it. Once everything is washed, a button reassembles the machine and finishes.
import { WASH_LABELS, correctParts } from './procedure.js';

export class SinkPanel {
  constructor(el, proc, hooks = {}) {
    this.el = el;
    this.proc = proc;
    this.hooks = hooks; // { onWashed, onReassemble }
    this.reset();
  }

  reset() {
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  open() {
    this.render();
    this.el.hidden = false;
  }

  close() {
    this.el.hidden = true;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  render() {
    const items = correctParts(this.proc.cfg.coolingUnit);
    const washed = this.proc.panel.washed;
    const allWashed = items.every((id) => washed.includes(id));

    const card = document.createElement('div');
    card.className = 'panel-card';
    card.innerHTML = `
      <button class="panel-x" aria-label="Close">×</button>
      <h2>Wash station</h2>
      <p class="panel-sub">${allWashed ? 'Everything is clean.' : 'Tap each item to wash it.'}</p>
      <div class="panel-grid"></div>
      <div class="panel-actions"></div>`;
    const grid = card.querySelector('.panel-grid');

    items.forEach((id) => {
      const done = washed.includes(id);
      const b = document.createElement('button');
      b.className = 'choice' + (done ? ' done' : '');
      b.disabled = done;
      b.innerHTML = (done ? '<span class="badge">✓</span>' : '') + WASH_LABELS[id];
      b.addEventListener('click', () => {
        const r = this.proc.washItem(id);
        if (!r.ok) return;
        if (r.allDone && this.hooks.onWashed) this.hooks.onWashed();
        this.render();
      });
      grid.appendChild(b);
    });

    if (allWashed) {
      const go = document.createElement('button');
      go.className = 'btn primary big';
      go.textContent = 'Reassemble everything';
      go.addEventListener('click', () => {
        this.close();
        if (this.hooks.onReassemble) this.hooks.onReassemble();
      });
      card.querySelector('.panel-actions').appendChild(go);
    }

    card.querySelector('.panel-x').addEventListener('click', () => this.close());
    this.el.replaceChildren(card);
  }
}
