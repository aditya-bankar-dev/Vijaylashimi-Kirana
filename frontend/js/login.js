if (Auth.token && Auth.user) location.replace('index.html');
$('f').addEventListener('submit', async e => {
  e.preventDefault(); $('err').textContent = '';
  const email = $('email').value.trim(), password = $('password').value;
  if (!email || !password) return ($('err').textContent = 'Enter email and password');
  $('btn').disabled = true; $('btn').textContent = 'Signing in...';
  try {
    const r = await api('/auth/login', { method: 'POST', body: { email, password }, silent: true });
    Auth.set(r.token, r.user); location.href = 'index.html';
  } catch (err) { $('err').textContent = err.message; $('btn').disabled = false; $('btn').textContent = 'Sign in'; }
});
