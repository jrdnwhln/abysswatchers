const STORAGE_KEY = "abyss-watchers-state";
const DEFAULT_STATE = {
  activeTopic: "AI research",
  watchlist: ["bitcoin", "ethereum", "solana"],
  notes: "",
  customQuery: "",
  radio: {
    enabled: false,
    lastInput: "",
    lastSearch: "Lil Poppa mix"
  }
};

const TOPICS = [
  "AI research",
  "Biotech",
  "Climate tech",
  "Quantum networks",
  "Neuroscience",
  "Materials science"
];

const els = {
  statusMessage: document.querySelector("#statusMessage"),
  activeTopicLabel: document.querySelector("#activeTopicLabel"),
  watchlistCount: document.querySelector("#watchlistCount"),
  nodeNotes: document.querySelector("#nodeNotes"),
  scienceQuery: document.querySelector("#scienceQuery"),
  topicChips: document.querySelector("#topicChips"),
  marketTableBody: document.querySelector("#marketTableBody"),
  paperFeed: document.querySelector("#paperFeed"),
  watchlist: document.querySelector("#watchlist"),
  summaryPanel: document.querySelector("#summaryPanel"),
  globalMarketCap: document.querySelector("#globalMarketCap"),
  globalVolume: document.querySelector("#globalVolume"),
  btcDominance: document.querySelector("#btcDominance"),
  paperCount: document.querySelector("#paperCount"),
  marketCapChange: document.querySelector("#marketCapChange"),
  assetInput: document.querySelector("#assetInput"),
  importPack: document.querySelector("#importPack"),
  refreshAll: document.querySelector("#refreshAll"),
  sharePack: document.querySelector("#sharePack"),
  runResearchSearch: document.querySelector("#runResearchSearch"),
  addAsset: document.querySelector("#addAsset"),
  topicChipTemplate: document.querySelector("#topicChipTemplate"),
  radioConsentPanel: document.querySelector("#radioConsentPanel"),
  radioControls: document.querySelector("#radioControls"),
  enableRadio: document.querySelector("#enableRadio"),
  radioInput: document.querySelector("#radioInput"),
  loadRadio: document.querySelector("#loadRadio"),
  stopRadio: document.querySelector("#stopRadio"),
  openYoutubeSearch: document.querySelector("#openYoutubeSearch"),
  radioStatus: document.querySelector("#radioStatus"),
  radioPlayerShell: document.querySelector("#radioPlayerShell"),
  radioPlayer: document.querySelector("#radioPlayer")
};

let state = loadState();
let latestMarket = [];
let latestPapers = [];

initialize();

async function initialize() {
  applyStateToUi();
  renderTopicChips();
  bindEvents();
  await refreshAllData();
  if (state.radio.enabled && state.radio.lastInput) {
    loadRadioFromInput(state.radio.lastInput, false);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      setStatus("Offline shell unavailable, but the node is still running locally.");
    });
  }
}

function loadState() {
  const urlState = readStateFromHash();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const localState = stored ? JSON.parse(stored) : {};
    return normalizeState({
      ...localState,
      ...(urlState ?? {})
    });
  } catch {
    return normalizeState(urlState ?? {});
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  writeStateToHash();
  applyStateToUi();
}

function applyStateToUi() {
  els.activeTopicLabel.textContent = state.activeTopic;
  els.watchlistCount.textContent = String(state.watchlist.length);
  els.nodeNotes.value = state.notes;
  els.scienceQuery.value = state.customQuery || state.activeTopic;
  els.radioInput.value = state.radio.lastInput;
  renderWatchlist();
  renderRadioState();
}

function bindEvents() {
  els.refreshAll.addEventListener("click", () => refreshAllData());
  els.runResearchSearch.addEventListener("click", async () => {
    state.customQuery = els.scienceQuery.value.trim() || state.activeTopic;
    saveState();
    await refreshResearch();
  });
  els.addAsset.addEventListener("click", async () => {
    const asset = sanitizeAsset(els.assetInput.value);
    if (!asset) {
      setStatus("Add a crypto asset slug like bitcoin, ethereum, or solana.");
      return;
    }

    if (!state.watchlist.includes(asset)) {
      state.watchlist = [...state.watchlist, asset];
      els.assetInput.value = "";
      saveState();
      await refreshMarkets();
    }
  });
  els.nodeNotes.addEventListener("input", (event) => {
    state.notes = event.target.value;
    saveState();
  });
  els.sharePack.addEventListener("click", exportSignalPack);
  els.importPack.addEventListener("change", importSignalPack);
  els.enableRadio.addEventListener("click", () => {
    state.radio.enabled = true;
    saveState();
    setRadioStatus("Radio enabled. Paste a YouTube video or playlist link to start listening.");
  });
  els.loadRadio.addEventListener("click", () => {
    const input = els.radioInput.value.trim();
    state.radio.lastInput = input;
    saveState();
    loadRadioFromInput(input, true);
  });
  els.stopRadio.addEventListener("click", () => {
    stopRadio();
    setRadioStatus("Radio stopped.");
  });
  els.openYoutubeSearch.addEventListener("click", () => {
    const search = encodeURIComponent(state.radio.lastSearch || "Lil Poppa mix");
    window.open(`https://www.youtube.com/results?search_query=${search}`, "_blank", "noopener");
  });
  document.querySelectorAll("[data-radio-fill]").forEach((button) => {
    button.addEventListener("click", () => {
      const fillValue = button.getAttribute("data-radio-fill") || "";
      state.radio.lastSearch = fillValue;
      saveState();
      setRadioStatus(`Search prepared for ${fillValue}. Use Search On YouTube, then paste a playlist or video link here.`);
    });
  });
}

function renderTopicChips() {
  els.topicChips.innerHTML = "";

  TOPICS.forEach((topic) => {
    const chip = els.topicChipTemplate.content.firstElementChild.cloneNode(true);
    chip.textContent = topic;
    chip.setAttribute("aria-selected", String(topic === state.activeTopic));
    chip.addEventListener("click", async () => {
      state.activeTopic = topic;
      state.customQuery = topic;
      saveState();
      renderTopicChips();
      await refreshResearch();
    });
    els.topicChips.appendChild(chip);
  });
}

async function refreshAllData() {
  setStatus("Refreshing crypto feed and research stream...");
  await Promise.all([refreshMarkets(), refreshResearch()]);
  renderSummary();
}

async function refreshMarkets() {
  const watchlist = state.watchlist.length ? state.watchlist : DEFAULT_STATE.watchlist;
  try {
    const [globalResponse, marketsResponse] = await Promise.all([
      fetchJson("https://api.coingecko.com/api/v3/global"),
      fetchJson(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(watchlist.join(","))}&order=market_cap_desc&per_page=12&page=1&sparkline=false&price_change_percentage=24h`
      )
    ]);

    latestMarket = Array.isArray(marketsResponse) ? marketsResponse : [];
    renderGlobalMetrics(globalResponse?.data);
    renderMarketTable();
    renderWatchlist();
    renderSummary();
    setStatus("Crypto mesh updated from CoinGecko.");
    cacheSnapshot("globalSnapshot", globalResponse?.data ?? {});
    cacheSnapshot("marketSnapshot", latestMarket);
  } catch {
    renderGlobalMetrics(readSnapshot("globalSnapshot", {}));
    latestMarket = readSnapshot("marketSnapshot");
    renderMarketTable();
    renderSummary();
    setStatus("Live market feed is unavailable, showing the latest cached market snapshot.");
  }
}

async function refreshResearch() {
  const query = state.customQuery || state.activeTopic;
  const cutoffDate = recentDateString(45);
  const endpoint =
    "https://api.crossref.org/works?" +
    new URLSearchParams({
      query,
      sort: "published",
      order: "desc",
      rows: "8",
      filter: `from-pub-date:${cutoffDate}`,
      select: "DOI,title,URL,published,container-title,subject,author"
    });

  try {
    const response = await fetchJson(endpoint);
    latestPapers = response?.message?.items ?? [];
    renderPaperFeed();
    renderSummary();
    setStatus("Research radar updated from Crossref.");
    cacheSnapshot("paperSnapshot", latestPapers);
  } catch {
    latestPapers = readSnapshot("paperSnapshot");
    renderPaperFeed();
    renderSummary();
    setStatus("Live research search is unavailable, showing the latest cached paper snapshot.");
  }
}

function renderGlobalMetrics(data) {
  if (!data) {
    return;
  }

  els.globalMarketCap.textContent = currency(data.total_market_cap?.usd);
  els.globalVolume.textContent = currency(data.total_volume?.usd);
  els.btcDominance.textContent = percent(data.market_cap_percentage?.btc);

  const change = data.market_cap_change_percentage_24h_usd ?? 0;
  els.marketCapChange.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}% over 24h`;
  els.marketCapChange.className = `market-sentiment ${change >= 0 ? "positive" : "negative"}`;
}

function renderMarketTable() {
  if (!latestMarket.length) {
    els.marketTableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No market data yet. Try refreshing the mesh.</div></td></tr>`;
    return;
  }

  els.marketTableBody.innerHTML = latestMarket
    .map((asset) => {
      const change = Number(asset.price_change_percentage_24h_in_currency ?? 0);
      return `
        <tr>
          <td>
            <div class="asset-cell">
              <img class="asset-icon" src="${asset.image}" alt="${asset.name} logo" />
              <div>
                <strong>${asset.name}</strong>
                <div class="subtle-copy">${asset.symbol.toUpperCase()}</div>
              </div>
            </div>
          </td>
          <td>${currency(asset.current_price)}</td>
          <td class="${change >= 0 ? "change-up" : "change-down"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</td>
          <td>${compactCurrency(asset.market_cap)}</td>
          <td>${compactCurrency(asset.total_volume)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderPaperFeed() {
  els.paperCount.textContent = String(latestPapers.length);

  if (!latestPapers.length) {
    els.paperFeed.innerHTML = `<div class="empty-state">No recent papers yet. Try another topic or refresh again.</div>`;
    return;
  }

  els.paperFeed.innerHTML = latestPapers
    .map((paper) => {
      const title = paper.title?.[0] || "Untitled paper";
      const journal = paper["container-title"]?.[0] || "Source unavailable";
      const published = extractDate(paper.published);
      const authors = (paper.author || [])
        .slice(0, 3)
        .map((author) => [author.given, author.family].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(", ");

      return `
        <article class="paper-card">
          <p class="paper-meta">${published} | ${escapeHtml(journal)}</p>
          <h3>${escapeHtml(title)}</h3>
          <p class="paper-meta">${escapeHtml(authors || "Author list unavailable")}</p>
          <a href="${paper.URL || `https://doi.org/${paper.DOI}`}" target="_blank" rel="noreferrer">Open paper record</a>
        </article>
      `;
    })
    .join("");
}

function renderWatchlist() {
  if (!state.watchlist.length) {
    els.watchlist.innerHTML = `<div class="empty-state">Add a few assets to start tracking your local signal mesh.</div>`;
    return;
  }

  els.watchlist.innerHTML = state.watchlist
    .map((assetId) => {
      const match = latestMarket.find((asset) => asset.id === assetId);
      const headline = match
        ? `${currency(match.current_price)} | ${signedPercent(match.price_change_percentage_24h_in_currency)}`
        : "Waiting for market data...";

      return `
        <article class="watchlist-item">
          <div>
            <h3>${formatAssetLabel(assetId)}</h3>
            <p>${headline}</p>
          </div>
          <button type="button" data-remove="${assetId}">Remove</button>
        </article>
      `;
    })
    .join("");

  els.watchlist.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const assetId = button.getAttribute("data-remove");
      state.watchlist = state.watchlist.filter((asset) => asset !== assetId);
      saveState();
      await refreshMarkets();
    });
  });
}

function renderSummary() {
  const topMover = [...latestMarket].sort(
    (left, right) =>
      Math.abs(right.price_change_percentage_24h_in_currency ?? 0) -
      Math.abs(left.price_change_percentage_24h_in_currency ?? 0)
  )[0];

  const newestPaper = latestPapers[0];
  const summaryPoints = [
    {
      title: "Market momentum",
      body: topMover
        ? `${topMover.name} is leading this node's watchlist with a ${signedPercent(topMover.price_change_percentage_24h_in_currency)} move in the last 24 hours.`
        : "Market movers will appear here once the crypto feed lands."
    },
    {
      title: "Research front",
      body: newestPaper
        ? `The newest paper in your stream is "${newestPaper.title?.[0] || "Untitled paper"}", helping anchor the latest ${state.customQuery || state.activeTopic} discussion.`
        : "Fresh publishing activity will appear here once the research stream loads."
    },
    {
      title: "Node thesis",
      body: state.notes.trim()
        ? state.notes.trim()
        : "Add a short thesis note so everyone using this node understands what signal matters most to you."
    }
  ];

  els.summaryPanel.innerHTML = summaryPoints
    .map(
      (point) => `
        <article class="summary-point">
          <h3>${escapeHtml(point.title)}</h3>
          <p>${escapeHtml(point.body)}</p>
        </article>
      `
    )
    .join("");
}

function exportSignalPack() {
  const payload = {
    exportedAt: new Date().toISOString(),
    activeTopic: state.activeTopic,
    customQuery: state.customQuery,
    watchlist: state.watchlist,
    notes: state.notes
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "abyss-watchers-signal-pack.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Signal pack exported for another node to import.");
}

async function importSignalPack(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const imported = JSON.parse(await file.text());
    state = {
      ...normalizeState(state),
      activeTopic: imported.activeTopic || state.activeTopic,
      customQuery: imported.customQuery || imported.activeTopic || state.customQuery,
      watchlist: Array.isArray(imported.watchlist)
        ? imported.watchlist.map(sanitizeAsset).filter(Boolean)
        : state.watchlist,
      notes: typeof imported.notes === "string" ? imported.notes : state.notes,
      radio: {
        ...state.radio
      }
    };
    saveState();
    renderTopicChips();
    await refreshAllData();
    setStatus("Signal pack imported into this local node.");
  } catch {
    setStatus("That signal pack could not be imported. Check that it is valid JSON.");
  } finally {
    event.target.value = "";
  }
}

function recentDateString(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function sanitizeAsset(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function formatAssetLabel(assetId) {
  return assetId
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function signedPercent(value) {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}%`;
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value ?? 0);
}

function compactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function percent(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function extractDate(published) {
  const parts = published?.["date-parts"]?.[0];
  if (!parts) {
    return "Date unavailable";
  }

  const [year, month = 1, day = 1] = parts;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
}

function cacheSnapshot(key, payload) {
  localStorage.setItem(`${STORAGE_KEY}-${key}`, JSON.stringify(payload));
}

function readSnapshot(key, fallback = []) {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${key}`);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeState(raw = {}) {
  return {
    ...DEFAULT_STATE,
    ...raw,
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [...DEFAULT_STATE.watchlist],
    radio: {
      ...DEFAULT_STATE.radio,
      ...(raw.radio ?? {})
    }
  };
}

function renderRadioState() {
  const enabled = Boolean(state.radio.enabled);
  els.radioConsentPanel.classList.toggle("hidden", enabled);
  els.radioControls.classList.toggle("hidden", !enabled);

  if (!enabled) {
    stopRadio();
  }
}

function loadRadioFromInput(input, autoplay) {
  if (!state.radio.enabled) {
    setRadioStatus("Enable the radio first so the player stays opt-in.");
    return;
  }

  const source = parseYouTubeSource(input);
  if (!source) {
    setRadioStatus("Paste a valid YouTube video or playlist link. Search pages do not embed directly.");
    return;
  }

  const autoplayFlag = autoplay ? "1" : "0";
  const params = new URLSearchParams({
    autoplay: autoplayFlag,
    playsinline: "1",
    rel: "0"
  });

  els.radioPlayer.src =
    source.kind === "playlist"
      ? `https://www.youtube.com/embed?listType=playlist&list=${encodeURIComponent(source.id)}&${params.toString()}`
      : `https://www.youtube.com/embed/${encodeURIComponent(source.id)}?${params.toString()}`;
  els.radioPlayerShell.classList.remove("hidden");
  setRadioStatus(
    autoplay
      ? "Station loaded. If your browser blocks autoplay, press play inside the YouTube frame."
      : "Last station restored. Press Load Station to start playback."
  );
}

function stopRadio() {
  els.radioPlayer.src = "";
  els.radioPlayerShell.classList.add("hidden");
}

function setRadioStatus(message) {
  els.radioStatus.textContent = message;
}

function parseYouTubeSource(input) {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return { kind: "video", id: trimmed };
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? { kind: "video", id } : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const playlistId = url.searchParams.get("list");
      if (playlistId) {
        return { kind: "playlist", id: playlistId };
      }

      const videoId =
        url.searchParams.get("v") ||
        url.pathname.split("/embed/")[1] ||
        url.pathname.split("/shorts/")[1] ||
        url.pathname.split("/live/")[1];

      if (videoId) {
        return { kind: "video", id: videoId.split(/[/?&]/)[0] };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function writeStateToHash() {
  const shareState = {
    topic: state.activeTopic,
    query: state.customQuery,
    watchlist: state.watchlist
  };

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareState))));
  history.replaceState(null, "", `#${encoded}`);
}

function readStateFromHash() {
  if (!location.hash.slice(1)) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(escape(atob(location.hash.slice(1))));
    const parsed = JSON.parse(decoded);
    return {
      activeTopic: parsed.topic || DEFAULT_STATE.activeTopic,
      customQuery: parsed.query || parsed.topic || DEFAULT_STATE.activeTopic,
      watchlist: Array.isArray(parsed.watchlist)
        ? parsed.watchlist.map(sanitizeAsset).filter(Boolean)
        : DEFAULT_STATE.watchlist
    };
  } catch {
    return null;
  }
}
