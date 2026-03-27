const STORAGE_KEY = "knit_sns_posts_v1";
const TAB_KEY = "knit_sns_active_tab_v1";
const USERS_KEY = "knit_sns_users_v1";
const SESSION_KEY = "knit_sns_session_v1";

const authGate = document.getElementById("authGate");
const appRoot = document.getElementById("appRoot");
const authMessage = document.getElementById("authMessage");
const authTabButtons = Array.from(document.querySelectorAll(".auth-tab-btn"));
const signupPanel = document.getElementById("auth-signup");
const loginPanel = document.getElementById("auth-login");
const signupForm = document.getElementById("signupForm");
const loginForm = document.getElementById("loginForm");

const settingsBtn = document.getElementById("settingsBtn");
const profileSettings = document.getElementById("profileSettings");
const profileForm = document.getElementById("profileForm");
const profileImageInput = document.getElementById("profileImageInput");
const profilePreview = document.getElementById("profilePreview");
const profileMessage = document.getElementById("profileMessage");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserNameEl = document.getElementById("currentUserName");
const currentUserAvatarEl = document.getElementById("currentUserAvatar");

const postForm = document.getElementById("postForm");
const feedEl = document.getElementById("feed");
const postCountEl = document.getElementById("postCount");
const photoInput = document.getElementById("photo");
const previewEl = document.getElementById("preview");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const uploadPanel = document.getElementById("panel-upload");
const feedPanel = document.getElementById("panel-feed");

let posts = loadPosts();
let users = loadUsers();
let currentUser = loadSession();

initialize();

function initialize() {
  setupAuthTabs();
  setupAppTabs();
  syncFromStorage();

  signupForm.addEventListener("submit", handleSignup);
  loginForm.addEventListener("submit", handleLogin);

  settingsBtn.addEventListener("click", toggleProfileSettings);
  profileForm.addEventListener("submit", handleProfileSave);
  profileImageInput.addEventListener("change", handleProfileImageChange);
  logoutBtn.addEventListener("click", handleLogout);

  window.addEventListener("storage", handleStorageSync);

  photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      previewEl.hidden = true;
      previewEl.src = "";
      return;
    }

    const imageData = await fileToDataUrl(file);
    previewEl.src = imageData;
    previewEl.hidden = false;
  });

  postForm.addEventListener("submit", handlePostSubmit);

  feedEl.addEventListener("click", (event) => {
    const likeButton = event.target.closest("[data-like-id]");
    if (likeButton) {
      const id = likeButton.dataset.likeId;
      const post = posts.find((item) => item.id === id);
      if (!post) {
        return;
      }

      post.liked = !post.liked;
      post.likes = Math.max(0, post.likes + (post.liked ? 1 : -1));

      savePosts(posts);
      renderFeed();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-id]");
    if (!deleteButton || !currentUser) {
      return;
    }

    const id = deleteButton.dataset.deleteId;
    const target = posts.find((item) => item.id === id);
    if (!target || target.author !== currentUser.nickname) {
      return;
    }

    posts = posts.filter((item) => item.id !== id);
    savePosts(posts);
    renderFeed();
  });

  if (currentUser && users.some((user) => user.nickname === currentUser.nickname)) {
    hydrateCurrentUserFromUsers();
    showApp();
  } else {
    currentUser = null;
    clearSession();
    showAuth();
  }

  renderFeed();
}

function handleStorageSync(event) {
  if (![STORAGE_KEY, USERS_KEY, SESSION_KEY].includes(event.key)) {
    return;
  }

  syncFromStorage();
  if (currentUser) {
    hydrateCurrentUserFromUsers();
    if (!currentUser) {
      showAuth();
      renderFeed();
      return;
    }
    applyCurrentUserProfile();
  }

  renderFeed();
}

function syncFromStorage() {
  posts = loadPosts();
  users = loadUsers();
}

function setupAuthTabs() {
  authTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAuthTab(button.dataset.authTarget === "login" ? "login" : "signup");
    });
  });

  setAuthTab("signup");
}

function setupAppTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.target;
      setAppTab(target);
    });
  });

  const savedTab = localStorage.getItem(TAB_KEY);
  setAppTab(savedTab === "feed" ? "feed" : "upload");
}

function setAuthTab(target) {
  const isLogin = target === "login";

  signupPanel.hidden = isLogin;
  loginPanel.hidden = !isLogin;

  authTabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.authTarget === target);
  });

  setAuthMessage("");
}

function setAppTab(target) {
  const isFeed = target === "feed";

  uploadPanel.hidden = isFeed;
  feedPanel.hidden = !isFeed;

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.target === target);
  });

  localStorage.setItem(TAB_KEY, isFeed ? "feed" : "upload");
}

function handleSignup(event) {
  event.preventDefault();

  const formData = new FormData(signupForm);
  const nickname = String(formData.get("nickname") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (nickname.length < 2) {
    setAuthMessage("닉네임은 2자 이상 입력해주세요.", "error");
    return;
  }

  if (password.length < 4) {
    setAuthMessage("비밀번호는 4자 이상 입력해주세요.", "error");
    return;
  }

  const exists = users.some((user) => user.nickname === nickname);
  if (exists) {
    setAuthMessage("이미 사용 중인 닉네임입니다.", "error");
    return;
  }

  users.push({ nickname, password, profileImage: "" });
  saveUsers(users);

  signupForm.reset();
  setAuthMessage("회원가입 완료! 이제 로그인해주세요.", "success");
  setAuthTab("login");
  document.getElementById("loginNickname").value = nickname;
}

function handleLogin(event) {
  event.preventDefault();
  syncFromStorage();

  const formData = new FormData(loginForm);
  const nickname = String(formData.get("nickname") || "").trim();
  const password = String(formData.get("password") || "").trim();

  const account = users.find((user) => user.nickname === nickname);
  if (!account) {
    setAuthMessage("가입되지 않은 닉네임입니다.", "error");
    return;
  }

  if (account.password !== password) {
    setAuthMessage("비밀번호가 일치하지 않습니다.", "error");
    return;
  }

  currentUser = {
    nickname: account.nickname,
    profileImage: account.profileImage || "",
  };
  saveSession(currentUser);
  loginForm.reset();
  showApp();
  renderFeed();
}

async function handlePostSubmit(event) {
  event.preventDefault();
  if (!currentUser) {
    showAuth();
    return;
  }

  if (!currentUser.profileImage) {
    profileSettings.hidden = false;
    settingsBtn.textContent = "설정 닫기";
    setProfileMessage("게시하려면 먼저 이미지 프로필을 설정해주세요.", "error");
    return;
  }

  const formData = new FormData(postForm);
  const caption = String(formData.get("caption") || "").trim();
  const file = photoInput.files?.[0];

  if (!caption || !file) {
    return;
  }

  const imageData = await fileToDataUrl(file);

  const post = {
    id: crypto.randomUUID(),
    author: currentUser.nickname,
    caption,
    imageData,
    createdAt: new Date().toISOString(),
    likes: 0,
    liked: false,
  };

  posts.unshift(post);
  savePosts(posts);
  renderFeed();

  postForm.reset();
  previewEl.hidden = true;
  previewEl.src = "";

  setAppTab("feed");
}

function handleLogout() {
  currentUser = null;
  clearSession();
  profileSettings.hidden = true;
  clearProfileMessage();
  showAuth();
  renderFeed();
}

function toggleProfileSettings() {
  const next = !profileSettings.hidden;
  profileSettings.hidden = next;
  settingsBtn.textContent = next ? "설정" : "설정 닫기";
  clearProfileMessage();

  if (!next && currentUser?.profileImage) {
    profilePreview.src = currentUser.profileImage;
    profilePreview.hidden = false;
  }
}

async function handleProfileImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    profilePreview.hidden = true;
    profilePreview.src = "";
    return;
  }

  const imageData = await fileToDataUrl(file);
  profilePreview.src = imageData;
  profilePreview.hidden = false;
}

async function handleProfileSave(event) {
  event.preventDefault();
  if (!currentUser) {
    return;
  }

  const file = profileImageInput.files?.[0];
  if (!file) {
    setProfileMessage("이미지를 선택해주세요.", "error");
    return;
  }

  const imageData = await fileToDataUrl(file);
  users = users.map((user) => {
    if (user.nickname !== currentUser.nickname) {
      return user;
    }
    return { ...user, profileImage: imageData };
  });
  saveUsers(users);

  currentUser = { ...currentUser, profileImage: imageData };
  saveSession(currentUser);

  profilePreview.src = imageData;
  profilePreview.hidden = false;
  profileForm.reset();

  applyCurrentUserProfile();
  renderFeed();
  setProfileMessage("프로필 이미지가 저장되었습니다.", "success");
}

function showAuth() {
  authGate.hidden = false;
  appRoot.hidden = true;
  setAuthTab("login");
}

function showApp() {
  if (!currentUser) {
    showAuth();
    return;
  }

  syncFromStorage();
  currentUserNameEl.textContent = currentUser.nickname;
  applyCurrentUserProfile();
  authGate.hidden = true;
  appRoot.hidden = false;
  profileSettings.hidden = true;
  settingsBtn.textContent = "설정";
  setAuthMessage("");

  if (!currentUser.profileImage) {
    profileSettings.hidden = false;
    settingsBtn.textContent = "설정 닫기";
    setProfileMessage("이미지 프로필을 먼저 설정한 뒤 활동해주세요.", "error");
  } else {
    clearProfileMessage();
  }
}

function applyCurrentUserProfile() {
  if (!currentUser?.profileImage) {
    currentUserAvatarEl.hidden = true;
    currentUserAvatarEl.removeAttribute("src");
    return;
  }

  currentUserAvatarEl.src = currentUser.profileImage;
  currentUserAvatarEl.hidden = false;
}

function hydrateCurrentUserFromUsers() {
  if (!currentUser) {
    return;
  }

  const account = users.find((user) => user.nickname === currentUser.nickname);
  if (!account) {
    currentUser = null;
    clearSession();
    return;
  }

  currentUser = {
    nickname: account.nickname,
    profileImage: account.profileImage || "",
  };
  saveSession(currentUser);
}

function setAuthMessage(message, type = "") {
  authMessage.textContent = message;
  authMessage.classList.remove("error", "success");
  if (type) {
    authMessage.classList.add(type);
  }
}

function setProfileMessage(message, type = "") {
  profileMessage.textContent = message;
  profileMessage.classList.remove("error", "success");
  if (type) {
    profileMessage.classList.add(type);
  }
}

function clearProfileMessage() {
  setProfileMessage("");
}

function getUserProfileImage(nickname) {
  const user = users.find((item) => item.nickname === nickname);
  return user?.profileImage || "";
}

function renderFeed() {
  syncFromStorage();
  postCountEl.textContent = `${posts.length}개`;

  if (!posts.length) {
    feedEl.innerHTML = '<p class="empty">첫 작품을 올려서 피드를 시작해보세요.</p>';
    return;
  }

  feedEl.innerHTML = posts.map((post) => {
    const likeClass = post.liked ? "like-btn liked" : "like-btn";
    const likeLabel = post.liked ? "응원 취소" : "응원하기";
    const canDelete = currentUser && post.author === currentUser.nickname;
    const deleteButton = canDelete ? `<button class="delete-btn" data-delete-id="${post.id}">삭제</button>` : "";
    const profileImage = getUserProfileImage(post.author);
    const avatar = profileImage ? `<img class="post-avatar" src="${profileImage}" alt="${escapeHtml(post.author)} 프로필" />` : "";

    return `
      <article class="post">
        <img src="${post.imageData}" alt="${escapeHtml(post.author)}님의 작품 사진" loading="lazy" />
        <div class="post-body">
          <div class="post-meta">
            <div class="post-user">
              ${avatar}
              <span class="author">${escapeHtml(post.author)}</span>
            </div>
            <time class="time" datetime="${post.createdAt}">${formatTime(post.createdAt)}</time>
          </div>
          <p class="caption">${escapeHtml(post.caption)}</p>
          <div class="post-actions">
            <button class="${likeClass}" data-like-id="${post.id}">🤍 ${likeLabel} ${post.likes}</button>
            ${deleteButton}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function loadPosts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePosts(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function loadUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(value) {
  localStorage.setItem(USERS_KEY, JSON.stringify(value));
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.nickname !== "string") {
      return null;
    }
    return {
      nickname: parsed.nickname,
      profileImage: typeof parsed.profileImage === "string" ? parsed.profileImage : "",
    };
  } catch {
    return null;
  }
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지 로드에 실패했습니다."));
    reader.readAsDataURL(file);
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "방금";
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return formatter.format(date);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
