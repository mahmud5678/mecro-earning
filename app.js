
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
      "Supabase SDK load হয়নি। Internet ও HTML script চেক কর।",
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

      if (updateError) throw updateError;

      currentProfile.display_name = name;
    }

    return data;
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
        "অ্যাকাউন্টের অনুরোধ হয়েছে। Email যাচাই করে Login কর।"
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
    message(
      "globalMessage",
      "Dashboard error: " + error.message,
      true
    );
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
    message(
      "globalMessage",
      "Profile load হয়নি: " + profileError.message,
      true
    );
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

  const { data: transactions, error: walletError } =
    await supabaseClient
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

function createAdminPanel() {
  let section = $("adminSection");

  if (!section) {
    section = document.createElement("section");
    section.id = "adminSection";
    section.className = "panel";

    const dashboard = $("dashboard");
    if (dashboard) {
      dashboard.append(section);
    } else {
      document.body.append(section);
    }
  }

  section.replaceChildren();

  section.append(
    safeText("h2", "MECRO Admin Panel"),
    safeText("p", "এখান থেকে নতুন Task তৈরি করতে পারবি।")
  );

  const form = document.createElement("form");
  form.id = "adminTaskForm";

  function addField(name, labelText, type, required = true) {
    const label = safeText("label", labelText);
    label.htmlFor = "admin_" + name;

    let input;

    if (type === "textarea") {
      input = document.createElement("textarea");
      input.maxLength = 3000;
    } else {
      input = document.createElement("input");
      input.type = type;
    }

    input.id = "admin_" + name;
    input.name = name;
    input.required = required;

    if (name === "reward") {
      input.min = "0.01";
      input.step = "0.01";
    }

    form.append(label, input);
    return input;
  }

  addField("title", "Task title", "text");
  addField("description", "Task description", "textarea");
  addField("reward", "Reward (BDT)", "number");
  addField("task_url", "Task URL (optional)", "url", false);

  const activeLabel = safeText("label", "Task active ");
  const active = document.createElement("input");
  active.type = "checkbox";
  active.name = "active";
  active.checked = true;
  activeLabel.append(active);

  const submit = safeText("button", "Add Task");
  submit.type = "submit";
  submit.className = "btn primary";

  const status = document.createElement("p");
  status.id = "adminTaskMessage";
  status.setAttribute("aria-live", "polite");

  form.append(activeLabel, submit, status);

  section.append(
    form,
    safeText("h3", "Existing Tasks")
  );

  const taskList = document.createElement("div");
  taskList.id = "adminTaskList";
  section.append(taskList);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !supabaseClient) return;

    submit.disabled = true;
    status.textContent = "Permission যাচাই হচ্ছে...";

    try {
      // This check controls the UI only.
      // Database RLS must independently enforce admin permission.
      const { data: profile, error: roleError } =
        await supabaseClient
          .from("profiles")
          .select("role")
          .eq("id", currentUser.id)
          .maybeSingle();

      if (roleError) throw roleError;

      if (profile?.role !== "admin") {
        throw new Error("এই অ্যাকাউন্টের Admin permission নেই।");
      }

      const title = form.elements.title.value.trim();
      const description = form.elements.description.value.trim();
      const reward = Number(form.elements.reward.value);
      const taskURL = form.elements.task_url.value.trim();

      if (!title || !description ||
          !Number.isFinite(reward) || reward <= 0) {
        throw new Error("Task-এর সব তথ্য সঠিকভাবে পূরণ কর।");
      }

      if (taskURL) {
        let parsed;

        try {
          parsed = new URL(taskURL);
        } catch (_) {
          throw new Error("Task URL সঠিক নয়।");
        }

        if (!["https:", "http:"].includes(parsed.protocol)) {
          throw new Error("Task URL http অথবা https হতে হবে।");
        }
      }

      status.textContent = "Task save হচ্ছে...";

      const { error: insertError } = await supabaseClient
        .from("tasks")
        .insert({
          title,
          description,
          reward,
          task_url: taskURL || null,
          active: active.checked
        });

      if (insertError) throw insertError;

      status.textContent = "Task সফলভাবে যোগ হয়েছে।";
      status.style.color = "#20d6a1";

      form.reset();
      active.checked = true;

      await loadAdminTasks();
      await loadTasks();
    } catch (error) {
      console.error("Admin task error:", error);

      status.textContent = "Task যোগ হয়নি: " + error.message;
      status.style.color = "#ff8585";
    } finally {
      submit.disabled = false;
    }
  });

  return section;
}

async function loadAdmin() {
  if (!currentUser || !supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
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

  const section = createAdminPanel();
  section.hidden = false;

  await loadAdminTasks();
  await loadAdminSubmissions();
}

async function loadAdminTasks() {
  const list = $("adminTaskList");
  if (!list || !currentUser || !supabaseClient) return;

  list.textContent = "Tasks load হচ্ছে...";

  const { data, error } = await supabaseClient
    .from("tasks")
    .select("id, title, reward, active")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Admin task list load হয়নি।";
    console.error("Admin task list error:", error.message);
    return;
  }

  list.replaceChildren();

  if (!data?.length) {
    list.textContent = "এখনো কোনো Task তৈরি হয়নি।";
    return;
  }

  for (const task of data) {
    const card = document.createElement("article");
    card.className = "task-card";

    card.append(
      safeText("h4", task.title),
      safeText("p", "Reward: " + money(task.reward)),
      safeText("p", task.active ? "Active" : "Inactive")
    );

    list.append(card);
  }
}

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
      safeText("p", "Proof: " + (item.proof_text || "কোনো proof দেওয়া হয়নি"))
    );

    if (item.status === "pending") {
      const approveBtn = document.createElement("button");
      approveBtn.type = "button";
      approveBtn.textContent = "Approve";

      approveBtn.addEventListener("click", async () => {
        await reviewSubmission(item.id, "approved", approveBtn);
      });

      const rejectBtn = document.createElement("button");
      rejectBtn.type = "button";
      rejectBtn.textContent = "Reject";

      rejectBtn.addEventListener("click", async () => {
        await reviewSubmission(item.id, "rejected", rejectBtn);
      });

      card.append(approveBtn, rejectBtn);
    }

    list.append(card);
  }
}

async function reviewSubmission(id, newStatus, button) {
  if (!currentUser || !supabaseClient) return;

  button.disabled = true;

  const { error } = await supabaseClient
    .from("task_submissions")
    .update({ status: newStatus })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    console.error("Review error:", error.message);
    alert("Status update হয়নি। Database permission পরীক্ষা কর।");
    button.disabled = false;
    return;
  }

  alert("Submission " + newStatus + " হয়েছে।");
  await loadAdminSubmissions();
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
    message(
      "withdrawMessage",
      "সঠিক বাংলাদেশি মোবাইল নম্বর লিখ।",
      true
    );
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

    message(
      "withdrawMessage",
      "Request জমা হয়েছে। Admin review করবে।"
    );

    $("withdrawForm").reset();

    await loadProfile();
    await loadHistory();
  } catch (error) {
    console.error("Withdrawal error:", error);

    message(
      "withdrawMessage",
      "Withdrawal প্রস্তুত নয় অথবা request ব্যর্থ হয়েছে। Database function ও permissions পরীক্ষা কর।",
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
  bindClick("googleSignup", googleLogin);
  bindClick("logoutBtn", logout);

  if ($("authForm")) {
    $("authForm").addEventListener("submit", handleAuth);
  }

  if ($("withdrawForm")) {
    $("withdrawForm").addEventListener(
      "submit",
      handleWithdrawal
    );
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
