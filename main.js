const STORAGE_KEY = "knit_sns_posts_v1";
const TAB_KEY = "knit_sns_active_tab_v1";

const postForm = document.getElementById("postForm");
const feedEl = document.getElementById("feed");
const postCountEl = document.getElementById("postCount");
const photoInput = document.getElementById("photo");
const previewEl = document.getElementById("preview");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const uploadPanel = document.getElementById("panel-upload");
const feedPanel = document.getElementById("panel-feed");

let posts = loadPosts();
renderFeed();
setupTabs();

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

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(postForm);
  const author = String(formData.get("author") || "").trim();
  const caption = String(formData.get("caption") || "").trim();
  const file = photoInput.files?.[0];

  if (!author || !caption || !file) {
    return;
  }

  const imageData = await fileToDataUrl(file);

  const post = {
    id: crypto.randomUUID(),
    author,
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

  setActiveTab("feed");
});

feedEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-like-id]");
  if (!button) {
    return;
  }

  const id = button.dataset.likeId;
  const post = posts.find((item) => item.id === id);
  if (!post) {
    return;
  }

  post.liked = !post.liked;
  post.likes = Math.max(0, post.likes + (post.liked ? 1 : -1));

  savePosts(posts);
  renderFeed();
});

function setupTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.target;
      setActiveTab(target);
    });
  });

  const savedTab = localStorage.getItem(TAB_KEY);
  setActiveTab(savedTab === "feed" ? "feed" : "upload");
}

function setActiveTab(target) {
  const isFeed = target === "feed";

  uploadPanel.hidden = isFeed;
  feedPanel.hidden = !isFeed;

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.target === target);
  });

  localStorage.setItem(TAB_KEY, isFeed ? "feed" : "upload");
}

function renderFeed() {
  postCountEl.textContent = `${posts.length}개`;

  if (!posts.length) {
    feedEl.innerHTML = '<p class="empty">첫 작품을 올려서 피드를 시작해보세요.</p>';
    return;
  }

  feedEl.innerHTML = posts.map((post) => {
    const likeClass = post.liked ? "like-btn liked" : "like-btn";
    const likeLabel = post.liked ? "응원 취소" : "응원하기";

    return `
      <article class="post">
        <img src="${post.imageData}" alt="${escapeHtml(post.author)}님의 작품 사진" loading="lazy" />
        <div class="post-body">
          <div class="post-meta">
            <span class="author">${escapeHtml(post.author)}</span>
            <time class="time" datetime="${post.createdAt}">${formatTime(post.createdAt)}</time>
          </div>
          <p class="caption">${escapeHtml(post.caption)}</p>
          <div class="post-actions">
            <button class="${likeClass}" data-like-id="${post.id}">🤍 ${likeLabel} ${post.likes}</button>
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
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function savePosts(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
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
