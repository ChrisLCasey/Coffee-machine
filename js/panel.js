// Wash-station overlay for step 11: choose what gets cleaned, then apply the 5-step method in order.
import { PART_CHOICES, METHOD_LABELS, METHOD_ORDER } from './procedure.js';

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class SinkPanel {
  constructor(el, proc, hooks = {}) {
    this.el = el;
    this.proc = proc;
    this.hooks = hooks; // { onWrong, onDone }
    this.reset();
  }

  reset() {
    this.selected = new Set();
    this.partOrder = shuffled(Object.keys(PART_CHOICES));
    this.methodOrder = shuffled(METHOD_ORDER);
    this.doneMethods = [];
    this.message = '';
    this.el.hidden = true;
  }

  open() {
    this.message = '';
    this.render();
    this.el.hidden = false;
  }

  close() {
    this.el.hidden = true;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  say(msg) {
    this.message = msg;
    const m = this.el.querySelector('.panel-msg');
    if (m) m.textContent = msg;
  }

  render() {
    const method = this.proc.panel.phase === 'method';
    const card = document.createElement('div');
    card.className = 'panel-card';
    card.innerHTML = `
      <button class="panel-x" aria-label="Close">×</button>
      <h2>Wash station</h2>
      <p class="panel-sub">${method ? 'Apply the cleaning method to the selected parts, one stage at a time.' : 'Select the parts that need cleaning in this procedure.'}</p>
      <div class="panel-grid"></div>
      <p class="panel-msg" role="status">${this.message}</p>
      <div class="panel-actions"></div>`;
    const grid = card.querySelector('.panel-grid');
    const actions = card.querySelector('.panel-actions');

    if (!method) {
      this.partOrder.forEach((id) => {
        const b = document.createElement('button');
        b.className = 'choice' + (this.selected.has(id) ? ' on' : '');
        b.textContent = PART_CHOICES[id];
        b.addEventListener('click', () => {
          if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
          b.classList.toggle('on');
        });
        grid.appendChild(b);
      });
      const go = document.createElement('button');
      go.className = 'btn primary';
      go.textContent = 'Continue';
      go.addEventListener('click', () => {
        const r = this.proc.submitSelection([...this.selected]);
        if (r.ok) {
          this.message = '';
          this.render();
        } else {
          this.hooks.onWrong && this.hooks.onWrong();
          card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
          this.say('That selection does not match what this procedure calls for.');
        }
      });
      actions.appendChild(go);
    } else {
      grid.classList.add('methods');
      this.methodOrder.forEach((id) => {
        const idx = this.doneMethods.indexOf(id);
        const b = document.createElement('button');
        b.className = 'choice' + (idx >= 0 ? ' done' : '');
        b.disabled = idx >= 0;
        b.innerHTML = (idx >= 0 ? `<span class="badge">${idx + 1}</span>` : '') + METHOD_LABELS[id];
        b.addEventListener('click', () => {
          const r = this.proc.tapMethod(id);
          if (r.ok) {
            this.doneMethods.push(id);
            if (r.finished) {
              this.render();
              this.say('All parts are clean.');
              setTimeout(() => { this.close(); this.hooks.onDone && this.hooks.onDone(); }, 900);
            } else {
              this.message = '';
              this.render();
            }
          } else {
            this.hooks.onWrong && this.hooks.onWrong();
            b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
            this.say('That is not the next stage.');
          }
        });
        grid.appendChild(b);
      });
    }

    card.querySelector('.panel-x').addEventListener('click', () => this.close());
    this.el.replaceChildren(card);
  }
}
