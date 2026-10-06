'use strict';
document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.target.querySelector('button');
  const error = document.querySelector('#login-error');
  button.disabled = true; error.hidden = true;
  try {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email:event.target.email.value, password: event.target.password.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not sign in. Please try again.');
    location.replace(result.redirect||'/');
  } catch (failure) {
    error.textContent = failure.message; error.hidden = false;
  } finally { button.disabled = false; }
});
