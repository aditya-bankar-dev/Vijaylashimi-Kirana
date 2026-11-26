function formModal({ title, fields, values = {}, size = '', onSubmit }) {
  const el = document.createElement('div'); el.className = 'modal fade';
  const input = f => {
    const v = values[f.key] ?? f.default ?? '', common = `id="f_${f.key}" class="form-control" ${f.required ? 'required' : ''}`;
    if (f.type === 'select') return `<select id="f_${f.key}" class="form-select" ${f.required ? 'required' : ''}>${f.placeholder !== undefined ? `<option value="">${esc(f.placeholder)}</option>` : ''}${f.options.map(o => { const [ov, ol] = typeof o === 'object' ? [o.v, o.l] : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
    if (f.type === 'file') return `<input type="file" id="f_${f.key}" class="form-control" accept="${f.accept || ''}">`;
    return `<input type="${f.type || 'text'}" ${common} ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} value="${esc(String(v).slice(0, f.type === 'date' ? 10 : 999))}">`;
  };
  el.innerHTML = `<div class="modal-dialog ${size}"><form class="modal-content" novalidate><div class="modal-header"><h6 class="modal-title">${esc(title)}</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body row g-3">${fields.map(f => `<div class="${f.col || 'col-md-6'}"><label class="form-label small mb-1">${esc(f.label)}${f.required ? ' *' : ''}</label>${input(f)}</div>`).join('')}</div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-green">Save</button></div></form></div>`;
  document.body.appendChild(el);
  const m = new bootstrap.Modal(el); el.addEventListener('hidden.bs.modal', () => el.remove());
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault(); const data = {};
    for (const f of fields) {
      const c = el.querySelector('#f_' + f.key); const v = f.type === 'file' ? c.files[0] : c.value.trim();
      if (f.required && !v) return toast(`${f.label} is required`, 'error');
      if (v !== '' && v !== undefined) data[f.key] = v;
    }
    const btn = e.submitter; btn.disabled = true;
    try { await onSubmit(data); m.hide(); } catch {} finally { btn.disabled = false; }
  });
  m.show(); return m;
}
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
async function download(path, name) {
  const res = await api(path, { raw: true }), a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
}
