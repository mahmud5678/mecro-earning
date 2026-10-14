/* MECRO Earning frontend. Uses only the Supabase publishable/anon key. */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://orerzedneirhykjqtdyw.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gFk6OpRBgbl9oczAw650IA_72KoG1RU';
  const MIN_WITHDRAWAL = 100;
  const $ = (id) => document.getElementById(id);
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const state = { user: null, profile: null, isAdmin: false, signup: false, tasks: [], submissions: [], transactions: [], withdrawals: [], activeView: 'home', adminTab: 'tasks' };

  const money = (n) => Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const niceDate = (value) => value ? new Date(value).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const setMessage = (id, message, type = '') => { const el = $(id); if (!el) return; el.textContent = message || ''; el.className = 'form-message' + (type ? ' ' + type : ''); };
  const toast = (message, type = 'success') => {
    const region = $('toastRegion'); if (!region) return;
    const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message; region.appendChild(node);
    window.setTimeout(() => node.remove(), 4200);
  };
  const setBusy = (button, busy, busyText = 'Please wait…') => {
    if (!button) return;
    if (busy) { button.dataset.oldText = button.innerHTML; button.disabled = true; button.textContent = busyText; }
    else { button.disabled = false; if (button.dataset.oldText) button.innerHTML = button.dataset.oldText; delete button.dataset.oldText; }
  };
  const friendlyError = (error) => {
    const raw = error?.message || 'Something went wrong. Please try again.';
    if (/Invalid login credentials/i.test(raw)) return 'Email or password is incorrect.';
    if (/User already registered/i.test(raw)) return 'This email already has an account. Please sign in.';
    if (/Email not confirmed/i.test(raw)) return 'Please confirm your email before signing in.';
    if (/Admin permission required/i.test(raw)) return 'This action is only available to an admin account.';
    if (/Minimum withdrawal/i.test(raw)) return 'Minimum withdrawal is ৳100.';
    if (/Insufficient available balance/i.test(raw)) return 'Your available balance is not enough for this request.';
    if (/already been reviewed|already been processed/i.test(raw)) return 'This item has already been processed. Refresh the list.';
    return raw;
  };
  const isHttpUrl = (value) => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };

  function setAuthMode(signup) {
    state.signup = signup;
    $('authTitle').textContent = signup ? 'Create your account' : 'Welcome back';
    $('authSubtitle').textContent = signup ? 'Join MECRO and explore available tasks.' : 'Sign in to continue to your workspace.';
    $('nameField').classList.toggle('hidden', !signup);
    $('name').required = signup;
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
    $('authSubmit').innerHTML = signup ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
    $('authSwitchText').textContent = signup ? 'Already a member?' : 'New to MECRO?';
         $('showSignup').classList.toggle('hidden', signup);
    $('showLogin').classList.toggle('hidden', !signup);
    setMessage('authMessage', '');
  }

  async function ensureProfile(user) {
    const { data: existing, error: readError } = await supabaseClient.from('profiles').select('id, username, display_name, role').eq('id', user.id).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      state.profile = existing; state.isAdmin = existing.role === 'admin';
      const name = existing.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member';
      if (!existing.display_name && name) {
        const { data: updated } = await supabaseClient.from('profiles').update({ display_name: name }).eq('id', user.id).select('id, username, display_name, role').maybeSingle();
        if (updated) { state.profile = updated; state.isAdmin = updated.role === 'admin'; }
      }
      return;
    }
    const base = (user.email || 'member').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'member';
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || base;
    const { data, error } = await supabaseClient.from('profiles').insert({ id: user.id, username: `${base}_${user.id.slice(0, 6)}`, display_name: displayName, role: 'user' }).select('id, username, display_name, role').single();
    if (error) {
      // A concurrent auth callback may already have created the profile.
      const retry = await supabaseClient.from('profiles').select('id, username, display_name, role').eq('id', user.id).maybeSingle();
      if (retry.data) { state.profile = retry.data; state.isAdmin = retry.data.role === 'admin'; return; }
      throw error;
    }
    state.profile = data; state.isAdmin = data.role === 'admin';
  }

  function showApp() {
    $('authSection').classList.add('hidden'); $('dashboard').classList.remove('hidden'); $('bottomNav').classList.remove('hidden');
    const display = state.profile?.display_name || state.user?.email?.split('@')[0] || 'Member';
    $('userName').textContent = display; $('userAvatar').textContent = display.trim().charAt(0).toUpperCase();
    $('accountAvatar').textContent = display.trim().charAt(0).toUpperCase(); $('accountName').textContent = display; $('accountEmail').textContent = state.user?.email || '';
    $('accountRole').textContent = state.isAdmin ? 'ADMIN' : 'MEMBER'; $('accountRole').classList.toggle('admin-role', state.isAdmin);
    $('moreAdminLink').classList.toggle('hidden', !state.isAdmin);
    $('adminSection').classList.toggle('hidden', !state.isAdmin);
    loadDashboard().catch(err => toast(friendlyError(err), 'error'));
    navigate(state.activeView || 'home');
  }

  async function startApp(user) {
    state.user = user;
    try { await ensureProfile(user); showApp(); }
    catch (error) { console.error(error); toast('Could not load your profile: ' + friendlyError(error), 'error'); }
  }

  async function loadDashboard() {
    await Promise.allSettled([loadTasks(), loadWallet(), loadHistory(), loadWithdrawals()]);
    if (state.isAdmin) await loadAdminAll();
  }

  async function loadTasks() {
    const list = $('taskList');
    const [taskRes, subRes] = await Promise.all([
      supabaseClient.from('tasks').select('id,title,description,reward,task_url,active,created_at').eq('active', true).order('created_at', { ascending: false }),
          supabaseClient.from('task_submissions').select('id,task_id,status,created_at').eq('user_id', state.user.id).order('created_at', { ascending: false })
    ]);
    if (taskRes.error) throw taskRes.error;
    if (subRes.error) throw subRes.error;
    state.tasks = taskRes.data || []; state.submissions = subRes.data || [];
    $('taskCount').textContent = state.tasks.length;
    const latestByTask = new Map(); state.submissions.forEach(s => { if (!latestByTask.has(String(s.task_id))) latestByTask.set(String(s.task_id), s); });
    if (!state.tasks.length) { list.innerHTML = '<div class="empty-state"><span>✦</span><strong>No active tasks right now</strong><p>Check again later for new opportunities.</p></div>'; return; }
    list.innerHTML = state.tasks.map(task => {
      const previous = latestByTask.get(String(task.id));
      const status = previous ? `<span class="status-pill ${esc(previous.status)}">${esc(previous.status)}</span>` : '<span class="status-pill available">Available</span>';
      const action = previous ? `<button class="btn btn-outline btn-small" disabled>${previous.status === 'pending' ? 'Under review' : previous.status === 'accepted' ? 'Completed' : previous.status === 'rejected' ? 'Rejected' : esc(previous.status)}</button>` : `<button class="btn btn-primary btn-small" data-task-submit="${esc(task.id)}">Submit proof <span>→</span></button>`;
      return `<article class="task-card"><div class="task-card-top"><span class="task-icon">✦</span><span class="reward-pill">৳${money(task.reward)}</span></div><div class="task-status-row">${status}<span class="task-date">${niceDate(task.created_at)}</span></div><h3>${esc(task.title)}</h3><p>${esc(task.description)}</p><div class="task-card-actions"><a class="btn btn-outline btn-small" href="${esc(isHttpUrl(task.task_url) ? task.task_url : '#')}" target="_blank" rel="noopener noreferrer" ${isHttpUrl(task.task_url) ? '' : 'aria-disabled="true"'}>Open task ↗</a>${action}</div></article>`;
    }).join('');
  }

  async function submitProof(taskId, button) {
    const task = state.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    const proof = window.prompt(`Task: ${task.title}\n\nPaste your proof link or write a short explanation. Do not submit passwords or private information:`);
    if (proof === null) return;
    const clean = proof.trim();
    if (clean.length < 4) { toast('Please enter a useful proof link or explanation.', 'error'); return; }
    if (/password|otp|verification code/i.test(clean)) { toast('Never submit passwords or verification codes as proof.', 'error'); return; }
    setBusy(button, true, 'Submitting…');
    try {
      const { error } = await supabaseClient.from('task_submissions').insert({ task_id: task.id, user_id: state.user.id, proof_text: clean, status: 'pending' });
      if (error) throw error;
      toast('Proof submitted. It will be reviewed by the admin.'); await loadTasks();
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function loadWallet() {
    const { data, error } = await supabaseClient.from('wallet_transactions').select('id,amount,reason,created_at').eq('user_id', state.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    state.transactions = data || [];
    const balance = state.transactions.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const earned = state.transactions.filter(row => Number(row.amount) > 0).reduce((sum, row) => sum + Number(row.amount), 0);
    $('balance').textContent = money(balance); $('totalEarned').textContent = '৳' + money(earned);
  }

  async function loadHistory() {
    const [txRes, subRes] = await Promise.all([
      supabaseClient.from('wallet_transactions').select('id,amount,reason,created_at').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(40),
      supabaseClient.from('task_submissions').select('id,task_id,status,created_at').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(40)
    ]);
    if (txRes.error) throw txRes.error; if (subRes.error) throw subRes.error;
    const txs = txRes.data || [], subs = subRes.data || [];
    $('approvedCount').textContent = subs.filter(s => s.status === 'accepted').length;
    const events = [
      ...txs.map(x => ({ date: x.created_at, title: x.reason || 'Wallet transaction', amount: Number(x.amount), kind: 'wallet' })),
      ...subs.map(x => ({ date: x.created_at, title: `Task submission #${x.id}`, status: x.status, kind: 'submission' }))
    ].sort((a,b) => new Date(b.date) - new Date(a.date));
    $('historyList').innerHTML = events.length ? events.map(e => `<div class="history-row"><span class="history-icon ${e.kind === 'wallet' ? 'wallet' : 'task'}">${e.kind === 'wallet' ? '৳' : '▤'}</span><div class="history-main"><strong>${esc(e.title)}</strong><small>${niceDate(e.date)}</small></div><div class="history-value">${e.kind === 'wallet' ? `<strong class="${e.amount >= 0 ? 'positive' : 'negative'}">${e.amount >= 0 ? '+' : '−'}৳${money(Math.abs(e.amount))}</strong>` : `<span class="status-pill ${esc(e.status)}">${esc(e.status)}</span>`}</div></div>`).join('') : '<div class="empty-state small-empty"><strong>No activity yet</strong><p>Your tasks and wallet transactions will appear here.</p></div>';
  }

  async function loadWithdrawals() {
    const { data, error } = await supabaseClient.from('withdrawal_requests').select('id,amount,payment_number,status,created_at').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    state.withdrawals = data || [];
    $('withdrawalHistory').innerHTML = state.withdrawals.length ? state.withdrawals.map(w => `<div class="compact-row"><div><strong>৳${money(w.amount)}</strong><small>${esc(w.payment_number || '')} · ${niceDate(w.created_at)}</small></div><span class="status-pill ${esc(w.status)}">${esc(w.status)}</span></div>`).join('') : '<div class="empty-note">No withdrawal requests yet.</div>';
  }

  async function handleWithdrawal(event) {
    event.preventDefault(); setMessage('withdrawMessage', '');
    const amount = Number($('withdrawAmount').value); const paymentNumber = $('paymentNumber').value.trim().replace(/\s/g, '');
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) { setMessage('withdrawMessage', 'Minimum withdrawal is ৳100.', 'error'); return; }
    if (!/^01\d{9}$/.test(paymentNumber)) { setMessage('withdrawMessage', 'Enter an 11-digit Bangladesh mobile number starting with 01.', 'error'); return; }
    const button = event.submitter || $('withdrawForm').querySelector('button[type="submit"]'); setBusy(button, true, 'Submitting request…');
    try {
      const { error } = await supabaseClient.rpc('request_withdrawal', { p_amount: amount, p_payment_number: paymentNumber });
      if (error) throw error;
            $('withdrawForm').reset(); setMessage('withdrawMessage', 'Request submitted. The admin will review it; payment is manual.', 'success'); toast('Withdrawal request submitted.'); await Promise.all([loadWallet(), loadWithdrawals(), loadHistory()]);
    } catch (error) { setMessage('withdrawMessage', friendlyError(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function handleAuth(event) {
    event.preventDefault(); setMessage('authMessage', '');
    const email = $('email').value.trim(); const password = $('password').value;
    const button = $('authSubmit'); setBusy(button, true, state.signup ? 'Creating account…' : 'Signing in…');
    try {
      if (state.signup) {
        const displayName = $('name').value.trim();
        const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: displayName } } });
        if (error) throw error;
        if (data.session) { await startApp(data.user); }
        else setMessage('authMessage', 'Account created. Check your email for a confirmation link, then sign in.', 'success');
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error; await startApp(data.user);
      }
    } catch (error) { setMessage('authMessage', friendlyError(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function googleLogin() {
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href.split('#')[0] } });
      if (error) throw error;
    } catch (error) { setMessage('authMessage', friendlyError(error), 'error'); }
  }

  async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) { toast(friendlyError(error), 'error'); return; }
    state.user = null; state.profile = null; state.isAdmin = false; state.activeView = 'home';
    $('dashboard').classList.add('hidden'); $('bottomNav').classList.add('hidden'); $('authSection').classList.remove('hidden'); $('moreMenu').classList.add('hidden'); setAuthMode(false);
  }

  function navigate(view) {
    if (!state.user) return;
    if (view === 'tasks') view = 'home';
    if (view === 'admin' && !state.isAdmin) { toast('Admin access only.', 'error'); view = 'home'; }
    state.activeView = view;
    ['walletSection','historySection','accountSection'].forEach(id => $(id).classList.add('hidden'));
    $('adminSection').classList.toggle('hidden', !(view === 'admin' && state.isAdmin));
    if (view === 'wallet') $('walletSection').classList.remove('hidden');
    else if (view === 'history') $('historySection').classList.remove('hidden');
    else if (view === 'account') $('accountSection').classList.remove('hidden');
    const showHome = view === 'home';
    $('tasksSection').classList.toggle('hidden', !showHome);
    $('home').classList.toggle('hidden', !showHome);
    $('balance-hero-placeholder');
    document.querySelector('.balance-hero').classList.toggle('hidden', !showHome);
    document.querySelector('.stat-grid').classList.toggle('hidden', !showHome);
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.go === view || (view === 'home' && el.dataset.go === 'home')));
    $('moreMenu').classList.add('hidden'); $('moreMenuBtn').setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

   async function loadAdminAll() { await Promise.allSettled([loadAdminTasks(), loadAdminSubmissions(), loadAdminWithdrawals()]); }
  async function loadAdminTasks() {
    const { data, error } = await supabaseClient.from('tasks').select('id,title,description,reward,task_url,active,created_at').order('created_at', { ascending: false });
    if (error) throw error;
    const list = $('adminTaskList');
    list.innerHTML = data?.length ? data.map(t => `<article class="admin-item"><div class="admin-item-main"><div class="admin-item-title"><strong>${esc(t.title)}</strong><span class="status-pill ${t.active ? 'active' : 'inactive'}">${t.active ? 'Active' : 'Paused'}</span></div><p>${esc(t.description)}</p><small>Task #${t.id} · Reward ৳${money(t.reward)} · ${niceDate(t.created_at)}</small><a href="${esc(isHttpUrl(t.task_url) ? t.task_url : '#')}" target="_blank" rel="noopener noreferrer">Open URL ↗</a></div><div class="admin-item-actions"><button class="btn btn-outline btn-small" data-task-toggle="${t.id}" data-active="${t.active}">${t.active ? 'Pause' : 'Activate'}</button><button class="btn btn-danger btn-small" data-task-delete="${t.id}">Delete</button></div></article>`).join('') : '<div class="empty-note">No tasks have been created.</div>';
  }

  async function createTask(event) {
    event.preventDefault(); setMessage('adminTaskMessage', '');
    const title = $('adminTaskTitle').value.trim(), description = $('adminTaskDescription').value.trim(), reward = Number($('adminTaskReward').value), task_url = $('adminTaskUrl').value.trim(), active = $('adminTaskActive').checked;
    if (!title || !description || reward <= 0 || !isHttpUrl(task_url)) { setMessage('adminTaskMessage', 'Enter a title, clear instructions, positive reward and valid http(s) URL.', 'error'); return; }
    const button = event.submitter || $('adminTaskForm').querySelector('button[type="submit"]'); setBusy(button, true, 'Publishing…');
    try {
      const { error } = await supabaseClient.from('tasks').insert({ title, description, reward, task_url, active }); if (error) throw error;
      $('adminTaskForm').reset(); $('adminTaskActive').checked = true; setMessage('adminTaskMessage', 'Task published successfully.', 'success'); toast('Task published.'); await Promise.all([loadAdminTasks(), loadTasks()]);
    } catch (error) { setMessage('adminTaskMessage', friendlyError(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function toggleTask(id, active, button) {
    setBusy(button, true, 'Saving…');
    try { const { error } = await supabaseClient.from('tasks').update({ active: !active }).eq('id', id); if (error) throw error; toast(!active ? 'Task activated.' : 'Task paused.'); await Promise.all([loadAdminTasks(), loadTasks()]); }
    catch (error) { toast(friendlyError(error), 'error'); } finally { setBusy(button, false); }
  }
  async function deleteTask(id, button) {
    if (!window.confirm(`Delete task #${id}? Existing submissions may prevent deletion. This cannot be undone.`)) return;
    setBusy(button, true, 'Deleting…');
    try { const { error } = await supabaseClient.from('tasks').delete().eq('id', id); if (error) throw error; toast('Task deleted.'); await Promise.all([loadAdminTasks(), loadTasks()]); }
    catch (error) { toast('Could not delete this task. If it has submissions, pause it instead. ' + friendlyError(error), 'error'); } finally { setBusy(button, false); }
  }

  async function loadAdminSubmissions() {
        const { data, error } = await supabaseClient.from('task_submissions').select('id,task_id,user_id,proof_text,status,created_at').order('created_at', { ascending: false }).limit(150);
    if (error) throw error;
    const rows = data || []; const pending = rows.filter(r => r.status === 'pending').length; $('pendingBadge').textContent = pending;
    const ids = [...new Set(rows.map(r => r.user_id))];
    let profiles = [];
    if (ids.length) { const res = await supabaseClient.from('profiles').select('id,username,display_name').in('id', ids); if (!res.error) profiles = res.data || []; }
    const pmap = new Map(profiles.map(p => [p.id, p]));
    const taskMap = new Map(state.tasks.map(t => [String(t.id), t]));
    $('adminSubmissionList').innerHTML = rows.length ? rows.map(s => {
      const p = pmap.get(s.user_id); const task = taskMap.get(String(s.task_id));
      return `<article class="admin-item"><div class="admin-item-main"><div class="admin-item-title"><strong>${esc(task?.title || `Task #${s.task_id}`)}</strong><span class="status-pill ${esc(s.status)}">${esc(s.status)}</span></div><p>${esc(s.proof_text)}</p><small>Submission #${s.id} · ${esc(p?.display_name || p?.username || s.user_id.slice(0,8))} · ${niceDate(s.created_at)}</small></div>${s.status === 'pending' ? `<div class="admin-item-actions"><button class="btn btn-primary btn-small" data-review="accepted" data-submission="${s.id}">Accept</button><button class="btn btn-danger btn-small" data-review="rejected" data-submission="${s.id}">Reject</button></div>` : ''}</article>`;
    }).join('') : '<div class="empty-note">No submissions yet.</div>';
  }

  async function reviewSubmission(id, newStatus, button) {
    const promptText = newStatus === 'accepted' ? 'Accept this proof and credit the task reward?' : 'Reject this proof? The user will not receive a reward.';
    if (!window.confirm(promptText)) return;
    setBusy(button, true, 'Processing…');
    try {
      const { data, error } = await supabaseClient.rpc('review_task_submission', { p_submission_id: Number(id), p_new_status: newStatus });
      if (error) throw error;
      toast(newStatus === 'accepted' ? `Approved. Reward ৳${money(data?.reward)} credited.` : 'Submission rejected.');
      await Promise.all([loadAdminSubmissions(), loadAdminWithdrawals(), loadWallet(), loadHistory(), loadTasks()]);
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function loadAdminWithdrawals() {
    const { data, error } = await supabaseClient.from('withdrawal_requests').select('id,user_id,amount,payment_number,status,created_at').order('created_at', { ascending: false }).limit(150);
    if (error) throw error;
    const rows = data || []; $('withdrawalBadge').textContent = rows.filter(r => r.status === 'pending').length;
    const ids = [...new Set(rows.map(r => r.user_id))]; let profiles = [];
    if (ids.length) { const res = await supabaseClient.from('profiles').select('id,username,display_name').in('id', ids); if (!res.error) profiles = res.data || []; }
    const pmap = new Map(profiles.map(p => [p.id, p]));
          $('adminWithdrawalList').innerHTML = rows.length ? rows.map(w => { const p = pmap.get(w.user_id); return `<article class="admin-item"><div class="admin-item-main"><div class="admin-item-title"><strong>৳${money(w.amount)}</strong><span class="status-pill ${esc(w.status)}">${esc(w.status)}</span></div><p><b>bKash:</b> ${esc(w.payment_number || 'Not provided')}</p><small>Request #${w.id} · ${esc(p?.display_name || p?.username || w.user_id.slice(0,8))} · ${niceDate(w.created_at)}</small></div>${w.status === 'pending' ? `<div class="admin-item-actions vertical-actions"><button class="btn btn-primary btn-small" data-withdraw-process="paid" data-request="${w.id}">Mark paid</button><button class="btn btn-danger btn-small" data-withdraw-process="rejected" data-request="${w.id}">Reject</button></div>` : ''}</article>`; }).join('') : '<div class="empty-note">No withdrawal requests yet.</div>';
  }

  async function processWithdrawal(id, status, button) {
    let note = null;
    if (status === 'paid') {
      note = window.prompt('First send the money from your bKash account. Then enter the transaction ID or short payment note:');
      if (note === null) return;
      if (!note.trim()) { toast('Enter the transaction ID or payment note after sending the money.', 'error'); return; }
      if (!window.confirm('Confirm that you have already sent the exact amount to the displayed bKash number?')) return;
    } else if (!window.confirm('Reject this withdrawal request?')) return;
    setBusy(button, true, 'Updating…');
    try {
      const { error } = await supabaseClient.rpc('admin_process_withdrawal', { p_request_id: Number(id), p_new_status: status, p_transaction_note: note }); if (error) throw error;
      toast(status === 'paid' ? 'Withdrawal marked paid and wallet ledger updated.' : 'Withdrawal rejected.'); await Promise.all([loadAdminWithdrawals(), loadWithdrawals(), loadWallet(), loadHistory()]);
    } catch (error) { toast(friendlyError(error), 'error'); } finally { setBusy(button, false); }
  }

  function setAdminTab(tab) {
    state.adminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.adminTab === tab));
    $('adminTasksTab').classList.toggle('hidden', tab !== 'tasks'); $('adminSubmissionsTab').classList.toggle('hidden', tab !== 'submissions'); $('adminWithdrawalsTab').classList.toggle('hidden', tab !== 'withdrawals');
  }

  function bindEvents() {
    $('authForm').addEventListener('submit', handleAuth); $('showSignup').addEventListener('click', () => setAuthMode(true)); $('showLogin').addEventListener('click', () => setAuthMode(false)); $('googleLogin').addEventListener('click', googleLogin);
    $('withdrawForm').addEventListener('submit', handleWithdrawal); $('adminTaskForm').addEventListener('submit', createTask);
    $('logoutBtn').addEventListener('click', logout); $('menuLogout').addEventListener('click', logout);
    $('moreMenuBtn').addEventListener('click', () => { const open = $('moreMenu').classList.toggle('hidden') === false; $('moreMenuBtn').setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]'); if (go) { navigate(go.dataset.go); return; }
      const taskButton = event.target.closest('[data-task-submit]'); if (taskButton) { submitProof(taskButton.dataset.taskSubmit, taskButton); return; }
            const review = event.target.closest('[data-review]'); if (review) { reviewSubmission(review.dataset.submission, review.dataset.review, review); return; }
      const toggle = event.target.closest('[data-task-toggle]'); if (toggle) { toggleTask(toggle.dataset.taskToggle, toggle.dataset.active === 'true', toggle); return; }
      const del = event.target.closest('[data-task-delete]'); if (del) { deleteTask(del.dataset.taskDelete, del); return; }
      const withdrawal = event.target.closest('[data-withdraw-process]'); if (withdrawal) { processWithdrawal(withdrawal.dataset.request, withdrawal.dataset.withdrawProcess, withdrawal); return; }
      const tab = event.target.closest('[data-admin-tab]'); if (tab) { setAdminTab(tab.dataset.adminTab); return; }
      if (!event.target.closest('.top-actions') && !event.target.closest('.more-menu')) { $('moreMenu').classList.add('hidden'); $('moreMenuBtn').setAttribute('aria-expanded', 'false'); }
    });
    $('refreshTasks').addEventListener('click', () => loadTasks().catch(e => toast(friendlyError(e), 'error')));
    $('refreshAdminTasks').addEventListener('click', () => loadAdminTasks().catch(e => toast(friendlyError(e), 'error')));
    $('refreshSubmissions').addEventListener('click', () => loadAdminSubmissions().catch(e => toast(friendlyError(e), 'error')));
    $('refreshWithdrawals').addEventListener('click', () => loadAdminWithdrawals().catch(e => toast(friendlyError(e), 'error')));
  }

  async function init() {
    $('yearNow').textContent = new Date().getFullYear(); setAuthMode(false); bindEvents();
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) console.error(error);
    if (session?.user) await startApp(session.user);
    supabaseClient.auth.onAuthStateChange((event, sessionNow) => {
      if (event === 'SIGNED_IN' && sessionNow?.user && sessionNow.user.id !== state.user?.id) {
        // Avoid auth callback lock issues: defer database work to a new task.
        window.setTimeout(() => startApp(sessionNow.user), 0);
      }
      if (event === 'SIGNED_OUT') { state.user = null; state.profile = null; state.isAdmin = false; $('dashboard').classList.add('hidden'); $('bottomNav').classList.add('hidden'); $('authSection').classList.remove('hidden'); }
    });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
        
