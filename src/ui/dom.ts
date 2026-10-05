export const CIRC = '①②③④⑤';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}분 ${s}초` : `${s}초`;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 확인창(<dialog>). 확인하면 true, 취소·Esc면 false */
export function confirmDialog(message: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.setAttribute('aria-labelledby', 'confirm-msg');
    dlg.innerHTML = `
      <p id="confirm-msg" class="confirm-msg">${esc(message)}</p>
      <div class="confirm-actions">
        <button type="button" class="btn-secondary" data-r="0">계속 풀기</button>
        <button type="button" class="btn-primary" data-r="1">${esc(okLabel)}</button>
      </div>`;
    const done = (r: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(r);
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    dlg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => done(b.dataset.r === '1')));
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector<HTMLButtonElement>('[data-r="0"]')!.focus();
  });
}
