
"use strict";

// MECRO EARNING — app.js
const SUPABASE_URL = "https://orerzedneirhykjqtdyw.supabase.co";
const SUPABASE_KEY = "sb_publishable_gFk6OpRBgbl9oczAw650IA_72KoG1RU";

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let authMode = "login";

const $ = (id) => document.getElementById(id);

function message(id, text, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#dc2626" : "#15803d";
}

function money(value) {
  return "৳" + Number(value || 0).toFixed(2);
}

function safeText(value) {
  return String(value ?? "");
}

function setupSupabase() {
  if (!window.supabase) {
    message("globalMessage", "Supabase SDK load হয়নি। index.html পরীক্ষা কর।", true);
    return false;
  }

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );
  }
  return true;
}

async function ensureProfile(user) {
  const username =
    (user.email || "user").split("@")[0] +
    "_" + user.id.slice(0, 6);

  const { data: existing, error: readError } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return existing;

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    username;

  const { data, error } = await supabaseClient
    .from("profiles")
    .insert({
      id: user.id,
      username,
      display_name: displayName,
      role: "user"
    })
    .select("id, username, display_name, role")
    .single();

  if (error) throw error;
  return data;
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";

  const nameInput = $("name");
  const title = $("authTitle");
  const submit = $("authSubmit");
  const showSignup = $("showSignup");
  const showLogin = $("showLogin");

  if (nameInput) {
    nameInput.hidden = authMode !== "signup";
    nameInput.required = authMode === "signup";
  }

  if (title) {
    title.textContent = authMode === "signup"
      ? "Create MECRO Account"
      : "Login to MECRO";
  }

  if (submit) {
    submit.textContent = authMode === "signup"
      ? "Create Account"
      : "Login";
  }

  if (showSignup) showSignup.hidden = authMode === "signup";
  if (showLogin) showLogin.hidden = authMode === "login";

  message("authMessage", "");
}

async function handleAuth(event) {
  event.preventDefault();
  if (!setupSupabase()) return;

  const email = $("email")?.value.trim();
  const password = $("password")?.value;
  const displayName = $("name")?.value.trim();

  if (!email || !password) {
    message("authMessage", "Email ও password দে।", true);
    return;
  }

  const button = $("authSubmit");
  if (button) button.disabled = true;

  message("authMessage", "অপেক্ষা কর...");

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName || email.split("@")[0] }
        }
      });

      if (error) throw error;

      if (data.session) {
        currentUser = data.user;
        await startApp(currentUser);
      } else {
        message(
          "authMessage",
          "Account তৈরি হয়েছে। Email verification চাইলে email verify করে Login কর।"
        );
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      currentUser = data.user;
      await startApp(currentUser);
    }
  } catch (error) {
    message("authMessage", "সমস্যা: " + error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function googleLogin() {
  if (!setupSupabase()) return;

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    message("authMessage", "Google Login হয়নি: " + error.message, true);
  }
}

async function startApp(user) {
  currentUser = user;

  if ($("authSection")) $("authSection").hidden = true;
  if ($("dashboard")) $("dashboard").hidden = false;

  try {
    currentProfile = await ensureProfile(user);
    await loadProfile();
    await loadTasks();
    await loadHistory();
    await loadAdmin();
    message("globalMessage", "Login সফল হয়েছে।");
  } catch (error) {
    message("globalMessage", "Account load হয়নি: " + error.message, true);
  }
}

async function loadProfile() {
  if (!currentUser || !supabaseClient) return;

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name, role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) throw error;

  currentProfile = profile;

  if ($("userName")) {
    $("userName").textContent =
      profile?.display_name ||
      profile?.username ||
      currentUser.email ||
      "User";
  }

  const { data: transactions, error: walletError } =
    await supabaseClient
      .from("wallet_transactions")
      .select("amount")
      .eq("user_id", currentUser.id);

  if (walletError) {
    if ($("balance")) $("balance").textContent = "৳--";
    console.error("Wallet load error:", walletError.message);
  } else {
    const balance = (transactions || []).reduce(
      (total, row) => total + Number(row.amount || 0),
      0
    );
    if ($("balance")) $("balance").textContent = money(balance);
  }

  const { count, error: countError } = await supabaseClient
    .from("task_submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", currentUser.id);

  if (!countError && $("taskCount")) {
    $("taskCount").textContent = String(count || 0);
  }
}

async function loadTasks() {
  const list = $("taskList");
  if (!list || !supabaseClient || !currentUser) return;

  list.textContent = "Tasks load হচ্ছে...";

  const { data: tasks, error } = await supabaseClient
    .from("tasks")
    .select("id, title, description, reward, task_url, active")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Tasks load হয়নি: " + error.message;
    return;
  }

  list.replaceChildren();

  if (!tasks?.length) {
    list.textContent = "এখন কোনো active task নেই।";
    return;
  }

  for (const task of tasks) {
    const card = document.createElement("div");
    card.style.cssText =
      "border:1px solid #ddd;border-radius:12px;padding:14px;margin:12px 0;";

    const title = document.createElement("h3");
    title.textContent = safeText(task.title);

    const description = document.createElement("p");
    description.textContent = safeText(task.description);

    const reward = document.createElement("p");
    reward.textContent = "Reward: " + money(task.reward);

    card.append(title, description, reward);

    if (task.task_url) {
      const link = document.createElement("a");
      link.href = task.task_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open Task";
      link.style.display = "inline-block";
      link.style.marginBottom = "10px";
      card.appendChild(link);
    }

    const form = document.createElement("form");
    form.style.marginTop = "10px";

    const proofLabel = document.createElement("label");
    proofLabel.textContent = "Proof / কাজের বিবরণ";

    const proof = document.createElement("textarea");
    proof.required = true;
    proof.maxLength = 3000;
    proof.placeholder = "কাজের প্রমাণ বা বিবরণ লিখ...";
    proof.style.cssText =
      "display:block;width:100%;min-height:70px;margin:8px 0;";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Submit Task";

    const status = document.createElement("p");

    form.append(proofLabel, proof, submit, status);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const proofText = proof.value.trim();
      if (!proofText) {
        status.textContent = "Proof লিখতে হবে।";
        return;
      }

      submit.disabled = true;
      status.textContent = "Submitting...";

      try {
        const { error: submitError } = await supabaseClient
          .from("task_submissions")
          .insert({
            task_id: task.id,
            user_id: currentUser.id,
            proof_text: proofText,
            status: "pending"
          });

        if (submitError) throw submitError;

        status.textContent = "Submission জমা হয়েছে; Admin review করবে।";
        proof.value = "";
        await loadProfile();
      } catch (err) {
        status.textContent = "Submit হয়নি: " + err.message;
      } finally {
        submit.disabled = false;
      }
    });

    card.appendChild(form);
    list.appendChild(card);
  }
             }
  
async function loadAdmin() {
  const section = $("adminSection");
  if (!section || !currentUser || !supabaseClient) return;

  section.hidden = true;

  // Admin role database profile থেকে যাচাই করা হচ্ছে।
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    message("globalMessage", "Admin role যাচাই হয়নি: " + error.message, true);
    return;
  }

  currentProfile = { ...currentProfile, ...profile };

  if (profile?.role !== "admin") return;

  if (typeof window.createAdminPanel === "function") {
    window.createAdminPanel();
  } else if (typeof createAdminPanel === "function") {
    createAdminPanel();
  }

  section.hidden = false;

  await loadAdminTasks();
  await loadAdminSubmissions();
}

async function loadAdminTasks() {
  const list = $("adminTaskList");
  if (!list || !supabaseClient) return;

  list.textContent = "Tasks load হচ্ছে...";

  const { data: tasks, error } = await supabaseClient
    .from("tasks")
    .select("id, title, reward, active, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Tasks load হয়নি: " + error.message;
    return;
  }

  list.replaceChildren();

  if (!tasks?.length) {
    list.textContent = "কোনো Task নেই।";
    return;
  }

  for (const task of tasks) {
    const card = document.createElement("div");
    card.style.cssText =
      "padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:8px;";

    const title = document.createElement("strong");
    title.textContent =
      safeText(task.title) + " — " + money(task.reward);

    const status = document.createElement("p");
    status.textContent = task.active ? "Active" : "Inactive";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete Task";
    deleteButton.style.cssText =
      "background:#dc2626;color:white;padding:8px 12px;border:0;border-radius:6px;";

    deleteButton.addEventListener("click", async () => {
      if (currentProfile?.role !== "admin") {
        alert("Admin permission নেই।");
        return;
      }

      const confirmed = confirm(
        '"' + task.title + '" delete করতে চাস? এই কাজটি ফিরিয়ে আনা নাও যেতে পারে।'
      );
      if (!confirmed) return;

      deleteButton.disabled = true;

      try {
        const { error: deleteError } = await supabaseClient
          .from("tasks")
          .delete()
          .eq("id", task.id)
          .select("id");

        if (deleteError) throw deleteError;

        alert("Delete request পাঠানো হয়েছে।");
        await loadAdminTasks();
        await loadTasks();
      } catch (err) {
        alert(
          "Task delete হয়নি: " + err.message +
          "\nSupabase-এর DELETE RLS permission বা submission-এর foreign-key সম্পর্ক পরীক্ষা কর।"
        );
      } finally {
        deleteButton.disabled = false;
      }
    });

    card.append(title, status, deleteButton);
    list.appendChild(card);
  }
}

async function loadAdminSubmissions() {
  const list = $("adminSubmissionList");
  if (!list || !supabaseClient) return;

  list.textContent = "Submissions load হচ্ছে...";

  const { data: submissions, error } = await supabaseClient
    .from("task_submissions")
    .select("id, task_id, user_id, proof_text, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Submissions load হয়নি: " + error.message;
    return;
  }

  list.replaceChildren();

  if (!submissions?.length) {
    list.textContent = "কোনো submission নেই।";
    return;
  }

  for (const submission of submissions) {
    const card = document.createElement("div");
    card.style.cssText =
      "padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:8px;";

    const heading = document.createElement("h4");
    heading.textContent = "Submission: " + submission.id;

    const taskInfo = document.createElement("p");
    taskInfo.textContent = "Task ID: " + submission.task_id;

    const userInfo = document.createElement("p");
    userInfo.textContent = "User ID: " + submission.user_id;

    const proofInfo = document.createElement("p");
    proofInfo.textContent = "Proof: " + safeText(submission.proof_text);

    const statusInfo = document.createElement("p");
    statusInfo.textContent = "Status: " + safeText(submission.status);

    card.append(heading, taskInfo, userInfo, proofInfo, statusInfo);

    if (submission.status === "pending") {
      const acceptButton = document.createElement("button");
      acceptButton.type = "button";
      acceptButton.textContent = "Accept";
      acceptButton.style.cssText =
        "background:#15803d;color:white;padding:8px 12px;border:0;border-radius:6px;margin-right:8px;";

      const rejectButton = document.createElement("button");
      rejectButton.type = "button";
      rejectButton.textContent = "Reject";
      rejectButton.style.cssText =
        "background:#dc2626;color:white;padding:8px 12px;border:0;border-radius:6px;";

      acceptButton.addEventListener("click", () => {
        reviewSubmission(submission.id, "approved", acceptButton);
      });

      rejectButton.addEventListener("click", () => {
        reviewSubmission(submission.id, "rejected", rejectButton);
      });

      card.append(acceptButton, rejectButton);
    }

    list.appendChild(card);
  }
}

async function reviewSubmission(id, newStatus, button) {
  if (currentProfile?.role !== "admin") {
    alert("Admin permission নেই।");
    return;
  }

  if (!["approved", "rejected"].includes(newStatus)) return;

  const action = newStatus === "approved" ? "Accept" : "Reject";
  if (!confirm("এই submission " + action + " করবি?")) return;

  if (button) button.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from("task_submissions")
      .update({ status: newStatus })
      .eq("id", id)
      .eq("status", "pending")
      .select("id, status")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      alert("Status বদলায়নি। Submission আগে review হয়েছে কি না এবং UPDATE RLS permission পরীক্ষা কর।");
      return;
    }

    alert("Submission " + newStatus + " হয়েছে।");
    await loadAdminSubmissions();
    await loadProfile();
  } catch (err) {
    alert("Review হয়নি: " + err.message);
  } finally {
    if (button) button.disabled = false;
  }
             }
     
async function loadHistory() {
  const list = $("historyList");
  if (!list || !supabaseClient || !currentUser) return;

  list.textContent = "History load হচ্ছে...";

  const { data, error } = await supabaseClient
    .from("wallet_transactions")
    .select("amount, reason, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "History load হয়নি: " + error.message;
    return;
  }

  list.replaceChildren();

  if (!data?.length) {
    list.textContent = "এখনো কোনো wallet transaction নেই।";
    return;
  }

  for (const row of data) {
    const item = document.createElement("div");
    item.style.cssText =
      "padding:10px;border-bottom:1px solid #ddd;";

    const reason = document.createElement("p");
    reason.textContent = safeText(row.reason || "Transaction");

    const amount = document.createElement("strong");
    amount.textContent = money(row.amount);

    const date = document.createElement("small");
    date.textContent = row.created_at
      ? new Date(row.created_at).toLocaleString()
      : "";

    item.append(reason, amount, document.createElement("br"), date);
    list.appendChild(item);
  }
}

async function handleWithdrawal(event) {
  event.preventDefault();

  if (!supabaseClient || !currentUser) {
    message("withdrawMessage", "আগে Login কর।", true);
    return;
  }

  const amount = Number($("withdrawAmount")?.value);
  const paymentNumber = $("paymentNumber")?.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    message("withdrawMessage", "সঠিক withdrawal amount দে।", true);
    return;
  }

  if (!paymentNumber) {
    message("withdrawMessage", "Payment number দে।", true);
    return;
  }

  const form = $("withdrawForm");
  const button = form?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  message("withdrawMessage", "Withdrawal request পাঠানো হচ্ছে...");

  try {
    const { error } = await supabaseClient.rpc("request_withdrawal", {
      p_amount: amount,
      p_payment_number: paymentNumber
    });

    if (error) throw error;

    message("withdrawMessage", "Withdrawal request জমা হয়েছে।");
    form?.reset();
    await loadProfile();
    await loadHistory();
  } catch (err) {
    message(
      "withdrawMessage",
      "Request হয়নি: " + err.message +
      " — request_withdrawal database function ও তার permission পরীক্ষা কর।",
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

async function logout() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    message("globalMessage", "Logout হয়নি: " + error.message, true);
    return;
  }

  currentUser = null;
  currentProfile = null;

  if ($("dashboard")) $("dashboard").hidden = true;
  if ($("adminSection")) $("adminSection").hidden = true;
  if ($("authSection")) $("authSection").hidden = false;

  message("globalMessage", "Logout সফল হয়েছে।");
  message("authMessage", "");
}

function bindClick(id, handler) {
  const el = $(id);
  if (!el || el.dataset.bound === "true") return;

  el.dataset.bound = "true";
  el.addEventListener("click", handler);
}

function init() {
  if (!setupSupabase()) return;

  const authForm = $("authForm");
  if (authForm && authForm.dataset.bound !== "true") {
    authForm.dataset.bound = "true";
    authForm.addEventListener("submit", handleAuth);
  }

  bindClick("showSignup", () => setAuthMode("signup"));
  bindClick("showLogin", () => setAuthMode("login"));
  bindClick("googleLogin", googleLogin);
  bindClick("googleLoginBtn", googleLogin);
  bindClick("logoutBtn", logout);

  const withdrawForm = $("withdrawForm");
  if (withdrawForm && withdrawForm.dataset.bound !== "true") {
    withdrawForm.dataset.bound = "true";
    withdrawForm.addEventListener("submit", handleWithdrawal);
  }

  setAuthMode("login");

  supabaseClient.auth.getSession().then(async ({ data, error }) => {
    if (error) {
      message("globalMessage", "Session load হয়নি: " + error.message, true);
      return;
    }

    if (data.session?.user) {
      await startApp(data.session.user);
    } else {
      if ($("authSection")) $("authSection").hidden = false;
      if ($("dashboard")) $("dashboard").hidden = true;
    }
  }).catch(err => {
    message("globalMessage", "সমস্যা: " + err.message, true);
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      currentProfile = null;
      if ($("dashboard")) $("dashboard").hidden = true;
      if ($("adminSection")) $("adminSection").hidden = true;
      if ($("authSection")) $("authSection").hidden = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
       }
            
