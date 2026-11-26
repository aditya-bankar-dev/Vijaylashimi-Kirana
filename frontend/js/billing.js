
Auth.require(['admin', 'manager', 'cashier']);
Layout.init('billing', 'POS Billing');

// Generate unique sale key without crypto.randomUUID()
const makeKey = () =>
  'sale-' + Date.now() + '-' + Math.random().toString(36).slice(2);

let cart = [], key = makeKey(), lastSale = null, timer;

const isWeight = u => ['kg', 'litre'].includes(u);
const step = p => (isWeight(p.unit) ? 0.25 : 1);

const modal = new bootstrap.Modal($('done'));

async function showProducts(q = '') {
  const r = await api(
    '/products' + (q ? '?q=' + encodeURIComponent(q) : ''),
    { silent: true }
  );

  $('grid').innerHTML = r.data.slice(0, 24).map(p => `
    <div class="col-6 col-md-4">
      <div class="cardx prod p-2 h-100" data-id="${p.id}">
        <div class="fw-semibold small">${esc(p.name)}</div>
        <div class="text-success fw-bold">
          ${money(p.selling_price)}
          <span class="text-muted small fw-normal"> / ${esc(p.unit)}</span>
        </div>
        <div class="small ${p.quantity <= p.reorder_level ? 'text-danger' : 'text-muted'}">
          Stock: ${p.quantity}
        </div>
      </div>
    </div>
  `).join('') || '<div class="text-muted p-3">No products found</div>';

  window._prods = Object.fromEntries(r.data.map(p => [p.id, p]));
}

function add(p) {
  if (p.quantity <= 0)
    return toast(`${p.name} is out of stock`, 'error');

  const l = cart.find(x => x.p.id === p.id);

  if (l) {
    if (l.qty + step(p) > p.quantity)
      return toast('Not enough stock', 'error');

    l.qty = round2(l.qty + step(p));
  } else {
    cart.push({ p, qty: 1 });
  }

  render();
}

function totals() {
  const sub = round2(
    cart.reduce((s, l) => s + l.p.selling_price * l.qty, 0)
  );

  const gst = cart.reduce(
    (s, l) =>
      s + (l.p.selling_price * l.qty * l.p.gst_rate) /
      (100 + Number(l.p.gst_rate)),
    0
  );

  let d = Number($('disc').value) || 0;

  if ($('discType').value === 'pct')
    d = sub * Math.min(d, 100) / 100;

  d = round2(Math.min(Math.max(d, 0), sub));

  const grand = round2(sub - d);

  return {
    sub,
    d,
    grand,
    gst: sub ? round2(gst * grand / sub) : 0
  };
}

function render() {
  $('cart').innerHTML = cart.map(l => `
    <tr data-id="${l.p.id}">
      <td class="small">
        ${esc(l.p.name)}
        <div class="text-muted">${money(l.p.selling_price)}</div>
      </td>
      <td>
        <div class="input-group input-group-sm">
          <button class="btn btn-outline-secondary" data-a="-">−</button>
          <input class="form-control text-center px-1" data-a="q" value="${l.qty}">
          <button class="btn btn-outline-secondary" data-a="+">+</button>
        </div>
      </td>
      <td class="text-end">${money(l.p.selling_price * l.qty)}</td>
      <td>
        <button class="btn btn-sm text-danger" data-a="x">
          <i class="bi bi-x-lg"></i>
        </button>
      </td>
    </tr>
  `).join('') ||
  '<tr><td colspan="4" class="text-center text-muted py-4">Cart is empty</td></tr>';

  const t = totals();

  $('sub').textContent = money(t.sub);
  $('dsc').textContent = '-' + money(t.d);
  $('gst').textContent = money(t.gst);
  $('total').textContent = money(t.grand);

  paid();
}

function paid() {
  const t = totals();

  const p = ['pcash', 'pupi', 'pcard'].reduce(
    (s, i) => s + (Number($(i).value) || 0),
    0
  );

  const diff = round2(p - t.grand);
  const el = $('pstate');

  el.textContent = !cart.length
    ? ''
    : diff >= 0
      ? `Change: ${money(diff)}`
      : `Due: ${money(-diff)}`;

  el.className =
    'small fw-semibold ' +
    (diff >= 0 ? 'text-success' : 'text-danger');
}

$('grid').onclick = e => {
  const c = e.target.closest('[data-id]');
  if (c) add(window._prods[c.dataset.id]);
};

$('cart').onclick = e => {
  const b = e.target.closest('[data-a]');
  const tr = e.target.closest('tr');

  if (!b || !tr) return;

  const l = cart.find(x => x.p.id == tr.dataset.id);
  if (!l) return;

  const s = step(l.p);

  if (b.dataset.a === 'x')
    cart = cart.filter(x => x !== l);

  if (b.dataset.a === '+') {
    if (l.qty + s > l.p.quantity)
      return toast('Not enough stock', 'error');

    l.qty = round2(l.qty + s);
  }

  if (b.dataset.a === '-') {
    l.qty = round2(l.qty - s);

    if (l.qty <= 0)
      cart = cart.filter(x => x !== l);
  }

  render();
};

$('cart').onchange = e => {
  if (e.target.dataset.a !== 'q') return;

  const l = cart.find(
    x => x.p.id == e.target.closest('tr').dataset.id
  );

  const v = Number(e.target.value);

  if (!(v > 0) || v > l.p.quantity)
    toast('Invalid quantity or not enough stock', 'error');
  else
    l.qty = v;

  render();
};

// Barcode scanner and product search
$('search').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;

  const v = e.target.value.trim();
  if (!v) return;

  try {
    add(
      (await api(
        '/products/barcode/' + encodeURIComponent(v),
        { silent: true }
      )).data
    );

    e.target.value = '';
    showProducts();
  } catch {
    showProducts(v);
  }
});

$('search').addEventListener('input', e => {
  clearTimeout(timer);

  timer = setTimeout(
    () => showProducts(e.target.value.trim()),
    250
  );
});

document.addEventListener('keydown', e => {
  if (e.key === 'F2') {
    e.preventDefault();
    $('search').focus();
  }
});

['disc', 'discType', 'pcash', 'pupi', 'pcard'].forEach(i => {
  $(i).addEventListener('input', () =>
    (i.startsWith('p') ? paid() : render())
  );
});

document.querySelectorAll('[data-fill]').forEach(b => {
  b.onclick = () => {
    ['pcash', 'pupi', 'pcard'].forEach(i => {
      $(i).value = '';
    });

    $(b.dataset.fill).value = totals().grand;
    paid();
  };
});

$('clear').onclick = () => {
  cart = [];

  ['pcash', 'pupi', 'pcard'].forEach(i => {
    $(i).value = '';
  });

  $('disc').value = 0;
  $('qr').innerHTML = '';

  render();
};

$('qrBtn').onclick = async () => {
  const amt = Number($('pupi').value) || totals().grand;

  if (!(amt > 0))
    return toast('Add items first', 'error');

  const r = await api('/payments/upi-qr?amount=' + amt);

  $('qr').innerHTML = `
    <img src="${r.qr}" width="200" alt="UPI QR">
    <div class="small text-muted">Scan to pay ${money(amt)}</div>
  `;
};

$('pay').onclick = async () => {
  if (!cart.length)
    return toast('Cart is empty', 'error');

  const t = totals();

  const payments = [
    ['cash', 'pcash'],
    ['upi', 'pupi'],
    ['card', 'pcard']
  ]
    .map(([m, i]) => ({
      method: m,
      amount: Number($(i).value) || 0
    }))
    .filter(x => x.amount > 0);

  if (!payments.length)
    return toast('Enter payment amount', 'error');

  $('pay').disabled = true;

  try {
    const r = await api('/sales', {
      method: 'POST',
      spinner: true,
      body: {
        idempotency_key: key,
        customer_id: $('customer').value || null,
        discount_amount: t.d,
        items: cart.map(l => ({
          product_id: l.p.id,
          quantity: l.qty
        })),
        payments
      }
    });

    lastSale = r.id;

    $('doneMsg').textContent =
      `${r.invoice_no} • Total ${money(r.grand_total)}` +
      `${r.change ? ' • Change ' + money(r.change) : ''}`;

    modal.show();

    // Generate a fresh key for the next sale
    key = makeKey();

    $('clear').click();
    showProducts();

  } catch {
    // API handles error display
  } finally {
    $('pay').disabled = false;
  }
};

$('pThermal').onclick = () =>
  openPdf(`/sales/${lastSale}/pdf?format=thermal`);

$('pA4').onclick = () =>
  openPdf(`/sales/${lastSale}/pdf?format=a4`);

$('done').addEventListener('hidden.bs.modal', () =>
  $('search').focus()
);

(async () => {
  const c = await api('/customers', { silent: true })
    .catch(() => ({ data: [] }));

  c.data
    .filter(x => x.mobile !== '0000000000')
    .forEach(x => {
      $('customer').insertAdjacentHTML(
        'beforeend',
        `<option value="${x.id}" data-disc="${x.discount_percent}">
          ${esc(x.name)} (${esc(x.mobile)})
        </option>`
      );
    });

  showProducts();
  render();
})();

$('customer').onchange = e => {
  const d = Number(
    e.target.selectedOptions[0].dataset.disc || 0
  );

  $('discType').value = d > 0 ? 'pct' : 'amt';
  $('disc').value = d > 0 ? d : 0;

  render();
};
