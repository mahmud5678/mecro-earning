
/* ==========================================
   MECRO EARNING - COMPLETE APP.JS
   Supabase JavaScript SDK v2
========================================== */

const SUPABASE_URL = "https://orerzedneirhykjqtdyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gFk6OpRBgbl9oczAw650IA_72KoG1RU";

const SITE_URL = "https://mahmud5678.github.io/mecro-earning/";

const $ = (id) => document.getElementById(id);

let supabaseClient = null;
let currentUser = null;
let authMode = "signup";
let appStarting = false;

// ---------- Helpers ----------

function message(id, text, isError = false) {
  const el = $(id);
  if (!el) return;

  el.textContent = text;
  el.style.color = isError ? "#ff8585" : "#20d6a1";
}

function money(amount) {
  return "৳" + Number(amount || 0).toFixed(2);
}

function showAuth(mode) {
  authMode = mode;

  if ($("authTitle")) {
    $("authTitle").textContent =
      mode === "signup" ? "Create your account" : "Log in";
  }

  if ($("name")) $("name").hidden = mode !== "signup";

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      mode === "signup" ? "Create account" : "Log in";
  }

  if ($("password")) {
    $("password").autocomplete =
      mode === "signup" ? "new-password" : "current-password";
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
  if ($("userName")) {
    $("userName").textContent =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "User";
  }
}

function showLoggedOut() {
  currentUser = null;
  if ($("dashboard")) $("dashboard").hidden = true;
  if ($("authSection")) $("authSection").hidden = false;
}

// ---------- Supabase Setup ----------

function setupSupabase() {
  if (!window.supabase) {
    message("globalMessage", "Supabase SDK লোড হয়নি। Internet সংযোগ চেক কর।", true);
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

// ---------- Google Login ----------

async function googleLogin() {
  if (!supabaseClient) {
    message("authMessage", "Supabase এখনো প্রস্তুত হয়নি।", true);
    return;
  }

  message("authMessage", "Google Login খোলা হচ্ছে...");

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: SITE_URL
    }
  });

  if (error) {
    message("authMessage", "Google Login হয়নি: " + error.message, true);
  }
}

// ---------- Profile Setup ----------

async function ensureProfile(user, displayName = "") {
  const name =
    displayName ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";

  const { data: profile, error: readError } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) throw readError;

  if (!profile) {
    const username = (user.email?.split("@")[0] || "user").slice(0, 50);

    const { error } = await supabaseClient.from("profiles").insert({
      id: user.id,
      username,
      display_name: name
    });

    if (error) throw error;
  } else if (!profile.display_name && name) {
    const { error } = await supabaseClient
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);

    if (error) throw error;
  }
}

// ---------- Email Signup / Login ----------

async function handleAuth(event) {
  event.preventDefault();

  if (!supabaseClient) {
    message("authMessage", "Supabase সেটআপ হয়নি।", true);
    return;
  }

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

  message("authMessage", "অপেক্ষা কর...");

  try {
    let result;

    if (authMode === "signup") {
      result = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: SITE_URL,
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

    const user = result.data.user;
    const session = result.data.session;

    if (!user) throw new Error("User তৈরি হয়নি। আবার চেষ্টা কর।");

    if (!session && authMode === "signup") {
      message("authMessage", "অ্যাকাউন্টের অনুরোধ হয়েছে। Email যাচাই করে Login কর।");
      return;
    }

    if (!session) {
      throw new Error("Login session পাওয়া যায়নি।");
    }

    await ensureProfile(user, displayName);
    await startApp(user);
    message("globalMessage", "সফলভাবে Login হয়েছে।");

  } catch (error) {
    message("authMessage", error.message || "কাজটি করা যায়নি।", true);
  } finally {
    if (button) button.disabled = false;
  }
}

// ---------- Dashboard ----------

async function startApp(user) {
  if (!user || appStarting) return;

  appStarting = true;

  try {
    currentUser = user;
    showDashboard(user);
    await loadProfile();
    await loadTasks();
    await loadHistory();
    await loadAdmin();
  } catch (error) {
    message("globalMessage", error.message || "Dashboard load হয়নি।", true);
  } finally {
    appStarting = false;
  }
}

// ---------- Profile and Wallet ----------

async function loadProfile() {
  if (!currentUser || !supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("display_name, username, role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    message("globalMessage", "Profile load হয়নি: " + error.message, true);
  } else if (data && $("userName")) {
    $("userName").textContent =
      data.display_name ||
      data.username ||
      currentUser.email?.split("@")[0] ||
      "User";
  }

  const { data: transactions, error: walletError } = await supabaseClient
    .from("wallet_transactions")
    .select("amount")
    .eq("user_id", currentUser.id);

  if (walletError) {
    if ($("balance")) $("balance").textContent = "Unavailable";
    message("globalMessage", "Wallet load হয়নি: " + walletError.message, true);
    return;
  }

  const balance = (transactions || []).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  if ($("balance")) $("balance").textContent = money(balance);
}

// ---------- Tasks ----------

async function loadTasks() {
  if (!supabaseClient || !currentUser || !$("taskList")) return;

  const taskList = $("taskList");
  taskList.textContent = "Tasks load হচ্ছে...";

  const { data, error } = await supabaseClient
    .from("tasks")
    .select("id, title, description, reward, task_url")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    taskList.textContent = "Tasks load হয়নি। Database permissions চেক কর।";
    return;
  }

  if ($("taskCount")) $("taskCount").textContent = (data || []).length;
  taskList.replaceChildren();

  if (!data || data.length === 0) {
    taskList.textContent = "এখনো কোনো task available নেই।";
    return;
  }

  for (const task of data) {
    const card = document.createElement("article");
    card.className = "task-card";

    const title = document.createElement("h3");
    title.textContent = task.title;

    const description = document.createElement("p");
    description.textContent = task.description || "Task details দেখ।";

    const reward = document.createElement("p");
    reward.className = "reward";
    reward.textContent = "Reward: " + money(task.reward);

    card.append(title, description, reward);

    if (task.task_url) {
      try {
        const parsedURL = new URL(task.task_url);

        if (["https:", "http:"].includes(parsedURL.protocol)) {
          const link = document.createElement("a");
          link.href = parsedURL.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "btn secondary";
          link.textContent = "Open task";
          card.append(link);
        }
      } catch (_) {}
    }

    const form = document.createElement("form");

    const label = document.createElement("label");
    label.textContent = "Task proof / completion details";

    const textarea = document.createElement("textarea");
    textarea.required = true;
    textarea.maxLength = 2000;
    textarea.placeholder = "কাজের সত্যিকারের প্রমাণ লিখ";

    const button = document.createElement("button");
    button.className = "btn primary";
    button.type = "submit";
    button.textContent = "Submit for review";

    const status = document.createElement("p");
    status.className = "message";
    status.setAttribute("aria-live", "polite");

    form.append(label, textarea, button, status);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!currentUser) return;

      const proof = textarea.value.trim();
      if (!proof) return;

      button.disabled = true;
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
        textarea.value = "";
      } catch (error) {
        status.textContent = error.message || "Submission হয়নি।";
        status.style.color = "#ff8585";
      } finally {
        button.disabled = false;
      }
    });

    card.append(form);
    taskList.append(card);
  }
}

// ---------- Withdrawal ----------

async function handleWithdrawal(event) {
  event.preventDefault();

  if (!supabaseClient || !currentUser) {
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

  const button = $("withdrawForm")?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  message("withdrawMessage", "Request পাঠানো হচ্ছে...");

  try {
    const { error } = await supabaseClient.rpc("request_withdrawal", {
      p_amount: amount,
      p_payment_number: paymentNumber
    });

    if (error) throw error;

    message("withdrawMessage", "Request জমা হয়েছে। Admin review করবে।");
    $("withdrawForm").reset();
    await loadProfile();
    await loadHistory();
  } catch (error) {
    console.error("Withdrawal error:", error.message);
    message(
      "withdrawMessage",
      "Withdrawal এখনো প্রস্তুত নয়। Secure database function তৈরি করতে হবে।",
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

// ---------- Wallet History ----------

async function loadHistory() {
  if (!supabaseClient || !currentUser || !$("historyList")) return;

  const history = $("historyList");
  history.textContent = "History load হচ্ছে...";

  const { data, error } = await supabaseClient
    .from("wallet_transactions")
    .select("amount, reason, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    history.textContent = "History load হয়নি।";
    return;
  }

  history.replaceChildren();

  if (!data || data.length === 0) {
    history.textContent = "এখনো কোনো transaction নেই।";
    return;
  }

  for (const item of data) {
    const row = document.createElement("article");
    row.className = "history-item";

    const amount = document.createElement("strong");
    amount.textContent =
      (Number(item.amount) >= 0 ? "+" : "") + money(item.amount);

    const reason = document.createElement("p");
    reason.textContent = item.reason || "Wallet transaction";

    const date = document.createElement("p");
    date.textContent = item.created_at
      ? new Date(item.created_at).toLocaleString()
      : "";

    row.append(amount, reason, date);
    history.append(row);
  }
}

// ---------- Admin ----------

async function loadAdmin() {
  if (!supabaseClient || !currentUser || !$("adminSection")) return;

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error || profile?.role !== "admin") {
    $("adminSection").hidden = true;
    return;
  }

  $("adminSection").hidden = false;

  if ($("adminContent")) {
    $("adminContent").textContent =
      "Admin role পাওয়া গেছে। Secure admin review tools এখনো যোগ করতে হবে।";
  }
}

// ---------- Logout ----------

async function logout() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    message("globalMessage", error.message, true);
    return;
  }

  showLoggedOut();
  message("globalMessage", "Logout হয়েছে।");
}

// ---------- Initialize ----------

async function init() {
  const bindClick = (id, callback) => {
    const el = $(id);
    if (el) el.addEventListener("click", callback);
  };

  bindClick("showSignup", () => showAuth("signup"));
  bindClick("showLogin", () => showAuth("login"));
  bindClick("heroSignup", () => showAuth("signup"));
  bindClick("heroLogin", () => showAuth("login"));
  bindClick("googleLogin", googleLogin);
  bindClick("googleLoginBtn", googleLogin);
  bindClick("googleSignup", googleLogin);
  bindClick("logoutBtn", logout);

  if ($("authForm")) {
    $("authForm").addEventListener("submit", handleAuth);
  }

  if ($("withdrawForm")) {
    $("withdrawForm").addEventListener("submit", handleWithdrawal);
  }

  bindClick("menuBtn", () => {
    if (!$("authSection")) return;
    $("authSection").hidden = !$("authSection").hidden;
    $("authSection").scrollIntoView({ behavior: "smooth" });
  });

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
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showLoggedOut();
    } else if (event === "SIGNED_IN" && session?.user) {
      setTimeout(() => startApp(session.user), 0);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
