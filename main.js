import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const TAB_KEY = "knit_sns_active_tab_v1";

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

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let posts = [];
let unsubscribePosts = null;

initialize();

function initialize() {
  setupAuthTabs();
  setupAppTabs();
  bindUiEvents();

  if (!isFirebaseConfigured()) {
    setAuthMessage("firebase-config.js에 Firebase 키를 입력해야 서비스가 동작합니다.", "error");
    return;
  }

  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (authUser) => {
    if (!authUser) {
      currentUser = null;
      stopPostsSubscription();
      showAuth();
      renderFeed();
      return;
    }

    const profile = await loadUserProfile(authUser.uid);
    if (!profile) {
      await signOut(auth);
      return;
    }

    currentUser = {
      uid: authUser.uid,
      nickname: profile.nickname,
      profileImage: profile.profileImage || "",
    };

    showApp();
    subscribePosts();
  });
}

function bindUiEvents() {
  signupForm.addEventListener("submit", handleSignup);
  loginForm.addEventListener("submit", handleLogin);

  settingsBtn.addEventListener("click", toggleProfileSettings);
  profileForm.addEventListener("submit", handleProfileSave);
  profileImageInput.addEventListener("change", handleProfileImageChange);
  logoutBtn.addEventListener("click", handleLogout);

  photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      previewEl.hidden = true;
      previewEl.src = "";
      return;
    }

    const imageData = await imageFileToDataUrl(file, { maxWidth: 1400, maxHeight: 1400, quality: 0.82 });
    previewEl.src = imageData;
    previewEl.hidden = false;
  });

  postForm.addEventListener("submit", handlePostSubmit);

  feedEl.addEventListener("click", async (event) => {
    if (!db || !currentUser) {
      return;
    }

    const likeButton = event.target.closest("[data-like-id]");
    if (likeButton) {
      await toggleLike(likeButton.dataset.likeId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-id]");
    if (!deleteButton) {
      return;
    }

    const id = deleteButton.dataset.deleteId;
    const target = posts.find((item) => item.id === id);
    if (!target || target.authorUid !== currentUser.uid) {
      return;
    }

    await deleteDoc(doc(db, "posts", id));
  });

  feedEl.addEventListener("submit", async (event) => {
    const form = event.target.closest(".comment-form");
    if (!form) {
      return;
    }

    event.preventDefault();
    if (!db || !currentUser) {
      showAuth();
      return;
    }

    const postId = form.dataset.commentPostId;
    const input = form.querySelector('input[name="commentText"]');
    const text = String(input?.value || "").trim();
    if (!postId || !text) {
      return;
    }

    await addComment(postId, text);
    form.reset();
  });
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
      setAppTab(button.dataset.target);
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

async function handleSignup(event) {
  event.preventDefault();
  if (!auth || !db) {
    return;
  }

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

  const email = nicknameToEmail(nickname);

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", credential.user.uid), {
      nickname,
      profileImage: "",
      createdAt: serverTimestamp(),
    });

    signupForm.reset();
    setAuthMessage("회원가입이 완료되었습니다.", "success");
    setAuthTab("login");
    document.getElementById("loginNickname").value = nickname;
    await signOut(auth);
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      setAuthMessage("이미 사용 중인 닉네임입니다.", "error");
      return;
    }
    setAuthMessage(explainAuthError(error.code, "signup"), "error");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!auth) {
    return;
  }

  const formData = new FormData(loginForm);
  const nickname = String(formData.get("nickname") || "").trim();
  const password = String(formData.get("password") || "").trim();

  try {
    await signInWithEmailAndPassword(auth, nicknameToEmail(nickname), password);
    loginForm.reset();
  } catch (error) {
    setAuthMessage(explainAuthError(error.code, "login"), "error");
  }
}

async function handlePostSubmit(event) {
  event.preventDefault();
  if (!db || !currentUser) {
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

  const imageData = await imageFileToDataUrl(file, { maxWidth: 1400, maxHeight: 1400, quality: 0.82 });

  await addDoc(collection(db, "posts"), {
    authorUid: currentUser.uid,
    authorNickname: currentUser.nickname,
    authorProfileImage: currentUser.profileImage,
    caption,
    imageData,
    likedBy: [],
    createdAt: serverTimestamp(),
  });

  postForm.reset();
  previewEl.hidden = true;
  previewEl.src = "";
  setAppTab("feed");
}

async function toggleLike(postId) {
  const target = posts.find((item) => item.id === postId);
  if (!target || !db || !currentUser) {
    return;
  }

  const ref = doc(db, "posts", postId);
  const liked = Array.isArray(target.likedBy) && target.likedBy.includes(currentUser.uid);

  await updateDoc(ref, {
    likedBy: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
  });
}

async function addComment(postId, text) {
  const target = posts.find((item) => item.id === postId);
  if (!target || !db || !currentUser) {
    return;
  }

  const comment = {
    id: crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    authorUid: currentUser.uid,
    authorNickname: currentUser.nickname,
    authorProfileImage: currentUser.profileImage || "",
    text,
    createdAt: new Date().toISOString(),
  };

  await updateDoc(doc(db, "posts", postId), {
    comments: arrayUnion(comment),
  });
}

async function handleLogout() {
  if (!auth) {
    return;
  }
  await signOut(auth);
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

  const imageData = await imageFileToDataUrl(file, { maxWidth: 420, maxHeight: 420, quality: 0.8 });
  profilePreview.src = imageData;
  profilePreview.hidden = false;
}

async function handleProfileSave(event) {
  event.preventDefault();
  if (!db || !currentUser) {
    return;
  }

  const file = profileImageInput.files?.[0];
  if (!file) {
    setProfileMessage("이미지를 선택해주세요.", "error");
    return;
  }

  try {
    const imageData = await imageFileToDataUrl(file, { maxWidth: 420, maxHeight: 420, quality: 0.8 });

    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        nickname: currentUser.nickname,
        profileImage: imageData,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    currentUser = { ...currentUser, profileImage: imageData };
    applyCurrentUserProfile();

    profilePreview.src = imageData;
    profilePreview.hidden = false;
    profileForm.reset();

    setProfileMessage("프로필 이미지가 저장되었습니다.", "success");
  } catch (error) {
    if (error?.code === "invalid-argument") {
      setProfileMessage("이미지 용량이 너무 커서 저장할 수 없습니다. 더 작은 이미지를 선택해주세요.", "error");
      return;
    }
    setProfileMessage(`프로필 저장 실패: ${error?.code || "unknown"}`, "error");
  }
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

async function loadUserProfile(uid) {
  if (!db) {
    return null;
  }

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    return null;
  }

  return snap.data();
}

function subscribePosts() {
  if (!db) {
    return;
  }

  stopPostsSubscription();

  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  unsubscribePosts = onSnapshot(q, (snapshot) => {
    posts = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        authorUid: data.authorUid || "",
        authorNickname: data.authorNickname || "",
        authorProfileImage: data.authorProfileImage || "",
        caption: data.caption || "",
        imageData: data.imageData || "",
        likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
        comments: Array.isArray(data.comments) ? data.comments : [],
        createdAt: data.createdAt || null,
      };
    });

    renderFeed();
  });
}

function stopPostsSubscription() {
  if (!unsubscribePosts) {
    return;
  }
  unsubscribePosts();
  unsubscribePosts = null;
  posts = [];
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

function renderFeed() {
  postCountEl.textContent = `${posts.length}개`;

  if (!posts.length) {
    feedEl.innerHTML = '<p class="empty">첫 작품을 올려서 피드를 시작해보세요.</p>';
    return;
  }

  feedEl.innerHTML = posts.map((post) => {
    const liked = currentUser && post.likedBy.includes(currentUser.uid);
    const likeClass = liked ? "like-btn liked" : "like-btn";
    const likeLabel = liked ? "응원 취소" : "응원하기";
    const likeCount = post.likedBy.length;
    const canDelete = currentUser && post.authorUid === currentUser.uid;
    const deleteButton = canDelete ? `<button class="delete-btn" data-delete-id="${post.id}">삭제</button>` : "";
    const avatar = post.authorProfileImage
      ? `<img class="post-avatar" src="${post.authorProfileImage}" alt="${escapeHtml(post.authorNickname)} 프로필" />`
      : "";

    const comments = Array.isArray(post.comments)
      ? [...post.comments].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      : [];

    const commentsHtml = comments.length
      ? comments.map((comment) => {
          const commentAvatar = comment.authorProfileImage
            ? `<img class="comment-avatar" src="${comment.authorProfileImage}" alt="${escapeHtml(comment.authorNickname)} 프로필" />`
            : "";

          return `
            <li class="comment-item">
              ${commentAvatar}
              <div class="comment-body">
                <div class="comment-head">
                  <span class="comment-name">${escapeHtml(comment.authorNickname)}</span>
                  <span class="comment-time">${formatTime(comment.createdAt)}</span>
                </div>
                <p class="comment-text">${escapeHtml(comment.text)}</p>
              </div>
            </li>
          `;
        }).join("")
      : '<li class="comment-empty">첫 댓글을 남겨보세요.</li>';

    return `
      <article class="post">
        <img src="${post.imageData}" alt="${escapeHtml(post.authorNickname)}님의 작품 사진" loading="lazy" />
        <div class="post-body">
          <div class="post-meta">
            <div class="post-user">
              ${avatar}
              <span class="author">${escapeHtml(post.authorNickname)}</span>
            </div>
            <time class="time">${formatTime(post.createdAt)}</time>
          </div>
          <p class="caption">${escapeHtml(post.caption)}</p>
          <div class="post-actions">
            <button class="${likeClass}" data-like-id="${post.id}">🤍 ${likeLabel} ${likeCount}</button>
            ${deleteButton}
          </div>
          <div class="comment-section">
            <ul class="comment-list">${commentsHtml}</ul>
            <form class="comment-form" data-comment-post-id="${post.id}">
              <input type="text" name="commentText" maxlength="160" placeholder="댓글을 입력하세요" required />
              <button type="submit" class="comment-btn">댓글</button>
            </form>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function formatTime(value) {
  let date = null;

  if (value?.toDate) {
    date = value.toDate();
  } else if (typeof value === "string") {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  }

  if (!date || Number.isNaN(date.getTime())) {
    return "방금";
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return formatter.format(date);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지 로드에 실패했습니다."));
    reader.readAsDataURL(file);
  });
}

async function imageFileToDataUrl(file, options = {}) {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.82,
  } = options;

  const rawDataUrl = await fileToDataUrl(file);
  const image = await dataUrlToImage(rawDataUrl);

  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return rawDataUrl;
  }

  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 변환에 실패했습니다."));
    image.src = dataUrl;
  });
}


function isFirebaseConfigured() {
  const required = [
    FIREBASE_CONFIG.apiKey,
    FIREBASE_CONFIG.authDomain,
    FIREBASE_CONFIG.projectId,
    FIREBASE_CONFIG.appId,
  ];

  return required.every((value) => typeof value === "string" && value.trim().length > 0);
}

function nicknameToEmail(nickname) {
  const normalized = String(nickname || "").trim();
  const encoded = toBase64Url(unescape(encodeURIComponent(normalized))).toLowerCase();
  const hash = hashNickname(normalized);
  const localPart = `u_${encoded.slice(0, 28)}_${hash}`;
  return `${localPart}@meontte.local`;
}

function hashNickname(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function explainAuthError(code, mode) {
  if (code === "auth/operation-not-allowed") {
    return "Firebase 콘솔에서 이메일/비밀번호 로그인을 먼저 활성화해주세요.";
  }
  if (code === "auth/invalid-api-key") {
    return "Firebase API 키가 올바르지 않습니다. firebase-config.js를 확인해주세요.";
  }
  if (code === "auth/network-request-failed") {
    return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
  }
  if (code === "auth/too-many-requests") {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "닉네임 또는 비밀번호가 올바르지 않습니다.";
  }
  if (code === "auth/weak-password") {
    return "비밀번호가 너무 약합니다. 더 강한 비밀번호를 사용해주세요.";
  }
  if (code === "auth/invalid-email") {
    return "닉네임 형식 변환에 실패했습니다. 다른 닉네임으로 시도해주세요.";
  }

  return mode === "signup"
    ? `회원가입에 실패했습니다. (${code || "알 수 없는 오류"})`
    : `로그인에 실패했습니다. (${code || "알 수 없는 오류"})`;
}

function toBase64Url(value) {
  const base64 = btoa(value);
  return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
