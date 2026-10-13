
/* ==========================================
   MECRO EARNING - COMPLETE APP.JS
   PART 1 OF 2
========================================== */

const SUPABASE_URL = "https://orerzedneirhykjqtdyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gFk6OpRBgbl9oczAw650IA_72KoG1RU";

const $ = (id) => document.getElementById(id);

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let appStarting = false;
let authMode = "signup";

function message(id, text, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", isError);
  el.style.color = isError ? "#ff8585" : "#20d6a1";
}

function money(amount) {
  return "৳" + Number(amount || 0).toFixed(2);
}

function safeText(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text == null ? "" : String(text);
  return el;
}

/* ---------- Authentication UI ---------- */

function showAuth(mode = "signup") {
  authMode = mode;

  if ($("authTitle")) {
    $("authTitle").textContent =
      mode === "signup" ? "Create your account" : "Log in";
  }

  if ($("name")) {
    $("name").hidden = mode !== "signup";
    $("name").required = mode === "signup";
  }

  if ($("password")) {
    $("password").autocomplete =
      mode === "signup" ? "new-password" : "current-password";
  }

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      mode === "signup" ? "Create account" : "Log in";
  }

  message("authMessage", "");

  if ($("authSection")) {
    $("authSection").hidden = false;
    $("authSection").scrollIntoView({ behavior: "smooth" });
  }
}

function showDashboard(user) {
  currentUser = user;

  if ($("authSection")) $("authSection").hidden = true;
  if ($("dashboard")) $("dashboard").hidden = false;

  const hero = document.querySelector(".hero");
  if (hero) hero.hidden = true;

  message("globalMessage", "");

  if ($("userName")) {
    $("userName").textContent =
      currentProfile?.display_name ||
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "User";
  }
}

function showLoggedOut() {
  currentUser = null;
  currentProfile = null;

  if ($("dashboard")) $("dashboard").hidden = true;
  if ($("authSection")) $("authSection").hidden = false;
  if ($("adminSection")) $("adminSection").hidden = true;

  const hero = document.querySelector(".hero");
  if (hero) hero.hidden = false;
}

/* ---------- Supabase Setup ---------- */

function setupSupabase() {
  if (!window.supabase) {
    message(
      "globalMessage",
      "Supabase SDK load হয়নি। Internet বা script tag চেক কর।",
      true
    );
    return false;
  }

  try {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );
    return true;
  } catch (error) {
    message("globalMessage", error.message, true);
    return false;
  }
}

/* ---------- Google Login ---------- */

async function googleLogin() {
  if (!supabaseClient) {
    message("authMessage", "Supabase প্রস্তুত হয়নি।", true);
    return;
  }

  try {
    message("authMessage", "Google Login খোলা হচ্ছে...");

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  } catch (error) {
    message("authMessage", "Google Login হয়নি: " + error.message, true);
  }
}

/* ---------- Profile Setup ---------- */

async function ensureProfile(user, displayName = "") {
  const name =
    displayName ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    currentProfile = data;

    if (!data.display_name && name) {
      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ display_name: name })
        .eq("id", user.id);

      if (updateError) {
        console.warn("Display name update failed:", updateError.message);
      } else {
        currentProfile.display_name = name;
      }
    }

    return currentProfile;
  }

  const baseUsername = (
    user.email?.split("@")[0] || "user"
  ).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 35) || "user";

  const username = baseUsername + "_" + user.id.slice(0, 6);

  const { data: created, error: insertError } = await supabaseClient
    .from("profiles")
    .insert({
      id: user.id,
      username,
      display_name: name
    })
    .select("id, username, display_name, role")
    .single();

  if (insertError) throw insertError;

  currentProfile = created;
  return created;
}

/* ---------- Email Signup / Login ---------- */

async function handleAuth(event) {
  event.preventDefault();

  if (!supabaseClient) return;

  const email = $("email")?.value.trim();
  const password = $("password")?.value || "";
  const displayName = $("name")?.value.trim() || "";

  if (!email || !password) {
    message("authMessage", "Email ও password লিখ।", true);
    return;
  }

  if (authMode === "signup" && !displayName) {
    message("authMessage", "তোর নাম লিখ।", true);
    return;
  }

  const button = $("authSubmit");
  if (button) button.disabled = true;

  try {
    let result;

    if (authMode === "signup") {
      result = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            window.location.origin + window.location.pathname,
          data: { display_name: displayName }
        }
      });
    } else {
      result = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) throw result.error;

    if (!result.data.session) {
      message(
        "authMessage",
        "Account তৈরি করার অনুরোধ হয়েছে। Email যাচাই করে Login কর।"
      );
      return;
    }

    await startApp(result.data.session.user, displayName);
  } catch (error) {
    console.error("Authentication error:", error);
    message("authMessage", error.message || "Login হয়নি।", true);
  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- Start Dashboard ---------- */

async function startApp(user, displayName = "") {
  if (!user || appStarting) return;

  appStarting = true;
  currentUser = user;

  try {
    await ensureProfile(user, displayName);
    showDashboard(user);

    await loadProfile();
    await loadTasks();
    await loadHistory();
    await loadAdmin();
  } catch (error) {
    console.error("Dashboard error:", error);
    message("globalMessage", "Dashboard error: " + error.message, true);
  } finally {
    appStarting = false;
  }
}

/* ---------- Profile & Wallet Balance ---------- */

async function loadProfile() {
  if (!currentUser || !supabaseClient) return;

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("display_name, username, role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) {
    message("globalMessage", "Profile load হয়নি: " + profileError.message, true);
    return;
  }

  currentProfile = profile;

  if ($("userName")) {
    $("userName").textContent =
      profile?.display_name ||
      profile?.username ||
      currentUser.email?.split("@")[0] ||
      "User";
  }

  const { data: transactions, error: walletError } = await supabaseClient
    .from("wallet_transactions")
    .select("amount")
    .eq("user_id", currentUser.id);

  if (walletError) {
    if ($("balance")) $("balance").textContent = "Unavailable";
    console.error("Wallet error:", walletError.message);
    return;
  }

  const balance = (transactions || []).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  if ($("balance")) $("balance").textContent = money(balance);
}

/* ---------- User Task List ---------- */

async function loadTasks() {
  const taskList = $("taskList");
  if (!taskList || !currentUser || !supabaseClient) return;

  taskList.textContent = "Tasks load হচ্ছে...";

  const { data, error } = await supabaseClient
    .from("tasks")
    .select("id, title, description, reward, task_url")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    taskList.textContent = "Tasks load হয়নি। Database permissions চেক কর।";
    console.error("Task load error:", error.message);
    return;
  }

  if ($("taskCount")) {
    $("taskCount").textContent = String((data || []).length);
  }

  taskList.replaceChildren();

  if (!data?.length) {
    taskList.textContent = "এখনো কোনো task available নেই।";
    return;
  }

  for (const task of data) {
    const card = document.createElement("article");
    card.className = "task-card";

    card.append(
      safeText("h3", task.title),
      safeText("p", task.description || "Task details দেখ।"),
      safeText("p", "Reward: " + money(task.reward))
    );

    if (task.task_url) {
      try {
        const url = new URL(task.task_url);

        if (url.protocol === "https:" || url.protocol === "http:") {
          const link = safeText("a", "Open task");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "btn secondary";
          card.append(link);
        }
      } catch (_) {}
    }

    const form = document.createElement("form");
    const label = safeText("label", "Task proof / completion details");
    const proofInput = document.createElement("textarea");

    proofInput.required = true;
    proofInput.maxLength = 2000;
    proofInput.placeholder = "কাজের সত্যিকারের প্রমাণ লিখ";

    const submit = safeText("button", "Submit for review");
    submit.type = "submit";
    submit.className = "btn primary";

    const status = document.createElement("p");
    status.setAttribute("aria-live", "polite");

    form.append(label, proofInput, submit, status);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const proof = proofInput.value.trim();
      if (!proof || !currentUser) return;

      submit.disabled = true;
      status.textContent = "Submitting...";

      try {
        const { error: submitError } = await supabaseClient
          .from("task_submissions")
          .insert({
            task_id: task.id,
            user_id: currentUser.id,
            proof_text: proof,
            status: "pending"
          });

        if (submitError) throw submitError;

        status.textContent = "Submitted for review.";
        status.style.color = "#20d6a1";
        proofInput.value = "";
      } catch (error) {
        status.textContent = error.message || "Submission হয়নি।";
        status.style.color = "#ff8585";
      } finally {
        submit.disabled = false;
      }
    });

    card.append(form);
    taskList.append(card);
  }
}

/* ---------- END OF PART 1 ----------
   Paste PART 2 immediately below this line.
========================================== */
   
/* ==========================================
   MECRO EARNING - COMPLETE APP.JS
   PART 2 OF 2
========================================== */

/* ---------- Admin Panel ---------- */

async function loadAdmin() {
  if (!currentUser || !supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Admin role check failed:", error.message);
    if ($("adminSection")) $("adminSection").hidden = true;
    return;
  }

  if (data?.role !== "admin") {
    if ($("adminSection")) $("adminSection").hidden = true;
    return;
  }

  currentProfile = { ...currentProfile, ...data };

  if (typeof createAdminPanel !== "function") {
    console.error("createAdminPanel function পাওয়া যায়নি।");
    message("globalMessage", "Admin Panel setup অসম্পূর্ণ।", true);
    return;
  }

  const section = createAdminPanel();
  section.hidden = false;

  await loadAdminTasks();
  await loadAdminSubmissions();
}

/* ---------- Load Admin Tasks ---------- */


async function loadAdminTasks() {
  const list = document.getElementById("adminTaskList");
  if (!list || !supabaseClient) return;

  list.textContent = "Loading tasks...";

  const { data, error } = await supabaseClient
    .from("tasks")
    .select("id, title, reward, active")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Tasks load হয়নি: " + error.message;
    return;
  }

  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.textContent = "কোনো Task নেই।";
    return;
  }

  data.forEach(task => {
    const item = document.createElement("div");
    item.style.cssText =
      "padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:8px;";

    const title = document.createElement("strong");
    title.textContent = task.title + " — ৳" + task.reward;

    const status = document.createElement("p");
    status.textContent = task.active ? "Active" : "Inactive";

    const btn = document.createElement("button");
    btn.textContent = "Delete Task";
    btn.style.cssText =
      "background:#dc2626;color:white;padding:8px 12px;border:0;border-radius:6px;";

    btn.addEventListener("click", async () => {
      if (!confirm("এই Task delete করতে চাস?")) return;

      btn.disabled = true;

      const { error: deleteError } = await supabaseClient
        .from("tasks")
        .delete()
        .eq("id", task.id);

      if (deleteError) {
        alert("Delete হয়নি: " + deleteError.message);
        btn.disabled = false;
        return;
      }

      alert("Task delete হয়েছে।");
      await loadAdminTasks();
      await loadTasks();
    });

    item.append(title, status, btn);
    list.appendChild(item);
  });
}


/* ---------- Load Submissions ---------- */

async function loadAdminSubmissions() {
  const list = $("adminSubmissionList");
  if (!list || !currentUser || !supabaseClient) return;

  list.textContent = "Submissions load হচ্ছে...";

  const { data, error } = await supabaseClient
    .from("task_submissions")
    .select("id, task_id, user_id, proof_text, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Submissions load হয়নি।";
    console.error("Submission load error:", error.message);
    return;
  }

  list.replaceChildren();

  if (!data?.length) {
    list.textContent = "এখনো কোনো Submission নেই।";
    return;
  }

  for (const item of data) {
    const card = document.createElement("article");
    card.className = "task-card";

    card.append(
      safeText("h4", "Status: " + item.status),
      safeText("p", "User ID: " + item.user_id),
      safeText("p", "Task ID: " + item.task_id),
      safeText("p", "Proof: " + (item.proof_text || "কোনো proof দেওয়া হয়নি")),
      safeText(
        "p",
        item.created_at
          ? "Submitted: " + new Date(item.created_at).toLocaleString()
          : ""
      )
    );

    if (item.status === "pending") {
      const approveBtn = safeText("button", "Approve");
      approveBtn.type = "button";
      approveBtn.className = "primary";

      approveBtn.addEventListener("click", async () => {
        await reviewSubmission(item.id, "approved", approveBtn);
      });

      const rejectBtn = safeText("button", "Reject");
      rejectBtn.type = "button";
      rejectBtn.className = "danger";

      rejectBtn.addEventListener("click", async () => {
        await reviewSubmission(item.id, "rejected", rejectBtn);
      });

      card.append(approveBtn, rejectBtn);
    }

    list.append(card);
  }
}

/* ---------- Review Submission ---------- */

async function reviewSubmission(id, newStatus, button) {
  if (!currentUser || !supabaseClient) return;
  if (!["approved", "rejected"].includes(newStatus)) return;

  const confirmed = confirm(
    newStatus === "approved"
      ? "এই Submission approve করতে চাস?"
      : "এই Submission reject করতে চাস?"
  );

  if (!confirmed) return;

  button.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from("task_submissions")
      .update({ status: newStatus })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      alert(
        "Status বদলায়নি। Submission আগে review হয়েছে কি না এবং Admin UPDATE permission চেক কর।"
      );
      return;
    }

    alert(
      newStatus === "approved"
        ? "Submission approved হয়েছে। Wallet-এ টাকা এখনো যোগ হয়নি।"
        : "Submission rejected হয়েছে।"
    );

    await loadAdminSubmissions();
  } catch (error) {
    console.error("Review error:", error);
    alert("Review ব্যর্থ: " + (error.message || "Database error"));
  } finally {
    button.disabled = false;
  }
}

/* ---------- Wallet History ---------- */

async function loadHistory() {
  const history = $("historyList");
  if (!history || !currentUser || !supabaseClient) return;

  history.textContent = "History load হচ্ছে...";

  const { data, error } = await supabaseClient
    .from("wallet_transactions")
    .select("amount, reason, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    history.textContent = "History load হয়নি।";
    console.error("History error:", error.message);
    return;
  }

  history.replaceChildren();

  if (!data?.length) {
    history.textContent = "এখনো কোনো transaction নেই।";
    return;
  }

  for (const item of data) {
    const row = document.createElement("article");
    row.className = "history-item";

    row.append(
      safeText(
        "strong",
        (Number(item.amount) >= 0 ? "+" : "") + money(item.amount)
      ),
      safeText("p", item.reason || "Wallet transaction"),
      safeText(
        "p",
        item.created_at
          ? new Date(item.created_at).toLocaleString()
          : ""
      )
    );

    history.append(row);
  }
}

/* ---------- Withdrawal Request ---------- */

async function handleWithdrawal(event) {
  event.preventDefault();

  if (!currentUser || !supabaseClient) {
    message("withdrawMessage", "আগে Login কর।", true);
    return;
  }

  const amount = Number($("withdrawAmount")?.value);
  const paymentNumber = $("paymentNumber")?.value.trim() || "";

  if (!Number.isFinite(amount) || amount <= 0) {
    message("withdrawMessage", "সঠিক amount লিখ।", true);
    return;
  }

  if (!/^01[3-9]\d{8}$/.test(paymentNumber)) {
    message("withdrawMessage", "সঠিক বাংলাদেশি মোবাইল নম্বর লিখ।", true);
    return;
  }

  const button = $("withdrawForm")?.querySelector(
    'button[type="submit"]'
  );

  if (button) button.disabled = true;

  message("withdrawMessage", "Request পাঠানো হচ্ছে...");

  try {
    const { error } = await supabaseClient.rpc(
      "request_withdrawal",
      {
        p_amount: amount,
        p_payment_number: paymentNumber
      }
    );

    if (error) throw error;

    message("withdrawMessage", "Request জমা হয়েছে। Admin review করবে।");
    $("withdrawForm").reset();

    await loadProfile();
    await loadHistory();
  } catch (error) {
    console.error("Withdrawal error:", error);

    message(
      "withdrawMessage",
      "Withdrawal request ব্যর্থ: " + (error.message || "Database error"),
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- Logout ---------- */

async function logout() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    message("globalMessage", error.message, true);
    return;
  }

  showLoggedOut();
  showAuth("login");
}

/* ---------- Initialize ---------- */

async function init() {
  const bindClick = (id, callback) => {
    const element = $(id);
    if (element) element.addEventListener("click", callback);
  };

  bindClick("showSignup", () => showAuth("signup"));
  bindClick("showLogin", () => showAuth("login"));
  bindClick("heroSignup", () => showAuth("signup"));
  bindClick("heroLogin", () => showAuth("login"));

  bindClick("googleLogin", googleLogin);
  bindClick("googleLoginBtn", googleLogin);
  bindClick("logoutBtn", logout);

  if ($("authForm")) {
    $("authForm").addEventListener("submit", handleAuth);
  }

  if ($("withdrawForm")) {
    $("withdrawForm").addEventListener("submit", handleWithdrawal);
  }

  if (!setupSupabase()) return;

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    message("globalMessage", error.message, true);
    return;
  }

  if (data.session?.user) {
    await startApp(data.session.user);
  } else {
    showLoggedOut();
    showAuth("signup");
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showLoggedOut();
    } else if (event === "SIGNED_IN" && session?.user) {
      setTimeout(() => {
        startApp(session.user);
      }, 0);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
