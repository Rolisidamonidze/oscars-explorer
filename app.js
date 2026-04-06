const state = {
  data: null,
  year: null,
  category: "",
  search: "",
  watchlist: new Map(),
  filmIndex: new Map(),
  spotlightEntry: null,
  randomEntry: null,
};

const elements = {
  yearSelect: document.getElementById("yearSelect"),
  categorySelect: document.getElementById("categorySelect"),
  searchInput: document.getElementById("searchInput"),
  filmList: document.getElementById("filmList"),
  statsYears: document.getElementById("statYears"),
  statsFilms: document.getElementById("statFilms"),
  statsCategories: document.getElementById("statCategories"),
  spotlightTitle: document.getElementById("spotlightTitle"),
  spotlightMeta: document.getElementById("spotlightMeta"),
  spotlightBadges: document.getElementById("spotlightBadges"),
  spotlightLink: document.getElementById("spotlightLink"),
  spotlightWatchlist: document.getElementById("spotlightWatchlist"),
  randomTitle: document.getElementById("randomTitle"),
  randomMeta: document.getElementById("randomMeta"),
  randomButton: document.getElementById("randomButton"),
  watchlistList: document.getElementById("watchlistList"),
  currentYearLabel: document.getElementById("currentYearLabel"),
  modal: document.getElementById("actorModal"),
  modalTitle: document.getElementById("actorModalTitle"),
  modalSummary: document.getElementById("modalSummary"),
  modalThumb: document.getElementById("modalThumb"),
  modalLink: document.getElementById("modalLink"),
  modalError: document.getElementById("modalError"),
  modalClose: document.getElementById("modalClose"),
  loading: document.getElementById("loading"),
};

const actorCache = new Map();

function getFilmKey(film, yearNumber) {
  const title = (film.film_title || "untitled").toLowerCase();
  return `${yearNumber}-${title}`
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchData() {
  elements.loading.classList.remove("hidden");
  try {
    const resp = await fetch("data/oscars.json");
    if (!resp.ok) {
      throw new Error("Data fetch failed");
    }
    state.data = await resp.json();
  } finally {
    elements.loading.classList.add("hidden");
  }
}

function populateFilters() {
  const years = state.data.years;
  elements.yearSelect.innerHTML = years
    .map((year) => `<option value="${year.award_show_number}">${year.label}</option>`)
    .join("");
  state.year = years[years.length - 1]?.award_show_number || years[0]?.award_show_number;
  elements.yearSelect.value = state.year;

  elements.categorySelect.innerHTML = [
    "<option value=\"\">All awards</option>",
    ...state.data.categories.map((cat) => `<option value="${cat}">${cat}</option>`),
  ].join("");

  updateStats();
}

function updateStats() {
  if (!state.data) return;
  elements.statsYears.textContent = `${state.data.stats.year_count} ceremonies`;
  elements.statsFilms.textContent = `${state.data.stats.film_count} film entries`;
  elements.statsCategories.textContent = `${state.data.stats.category_count} award categories`;
}

function getCurrentYearBlock() {
  const year = Number(state.year);
  const found = state.data.years.find((y) => y.award_show_number === year);
  return found || state.data.years[state.data.years.length - 1];
}

function filterFilms() {
  const yearBlock = getCurrentYearBlock();
  const search = state.search.trim().toLowerCase();
  return yearBlock.films.filter((film) => {
    if (state.category) {
      const hasCategory = film.nominations.some((nom) => nom.category === state.category);
      if (!hasCategory) return false;
    }
    if (!search) {
      return true;
    }
    const text = [film.film_title, film.production_companies, film.distributors]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (text.includes(search)) {
      return true;
    }
    return film.nominations.some((nom) => {
      const cand = [nom.category, nom.nomination_statement, ...(nom.people || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return cand.includes(search);
    });
  });
}

function renderFilms() {
  const films = filterFilms();
  const yearBlock = getCurrentYearBlock();
  elements.currentYearLabel.textContent = yearBlock.label;
  state.filmIndex.clear();
  state.randomEntry = null;

  if (!films.length) {
    elements.filmList.innerHTML = `<p class="muted">No films match the current filters.</p>`;
    updateSpotlight([]);
    updateRandomCard();
    return;
  }

  const html = films
    .map((film) => {
      const key = getFilmKey(film, yearBlock.award_show_number);
      const entry = {
        film,
        yearLabel: yearBlock.label,
        yearNumber: yearBlock.award_show_number,
        key,
      };
      state.filmIndex.set(key, entry);

      const nominationItems = film.nominations
        .map((nom) => {
          const winnerLabel = nom.winner ? `<span class="winner">Winner</span>` : "";
          const people = (nom.people || [])
            .map((person) => `<button class="person-chip" data-person="${person.replace(/"/g, "&quot;")}">${person}</button>`)
            .join("");
          const characters = nom.characters ? `<div class="nomination-characters">${nom.characters.join(", ")}</div>` : "";
          return `
            <li class="nomination">
              <strong>${nom.category || "Unknown"} ${winnerLabel}</strong>
              <span>${nom.nomination_statement || "–"}</span>
              ${characters}
              <div class="nomination-people">${people}</div>
            </li>
          `;
        })
        .join("");

      const saved = state.watchlist.has(key);
      const filmLink = film.film_link || "#";
      const linkAttrs = film.film_link ? "" : 'aria-disabled="true" tabindex="-1"';

      return `
        <article class="film-card">
          <header class="film-card-header">
            <div>
              <p class="film-year">${yearBlock.label}</p>
              <h3>${film.film_title || "Untitled"}</h3>
            </div>
            <div class="film-card-actions">
              <a class="link-button" href="${filmLink}" target="_blank" rel="noreferrer" ${linkAttrs}>Awards page</a>
              <button class="watchlist-toggle${saved ? " saved" : ""}" data-film-key="${key}" type="button" aria-pressed="${saved}">${saved ? "Saved" : "Save"}</button>
            </div>
          </header>
          <div class="film-meta">
            ${film.production_companies ? `<span>${film.production_companies}</span>` : ""}
            ${film.distributors ? `<span>${film.distributors}</span>` : ""}
          </div>
          <ul class="nomination-list">${nominationItems}</ul>
        </article>
      `;
    })
    .join("");

  elements.filmList.innerHTML = html;
  attachFilmInteractions();
  updateSpotlight([...state.filmIndex.values()]);
  updateRandomCard();
}

function attachFilmInteractions() {
  document.querySelectorAll(".person-chip").forEach((chip) => {
    chip.addEventListener("click", (event) => {
      const person = event.currentTarget.dataset.person;
      openActorModal(person);
    });
  });
  document.querySelectorAll(".watchlist-toggle").forEach((button) => {
    const key = button.dataset.filmKey;
    button.addEventListener("click", () => {
      const entry = state.filmIndex.get(key);
      if (!entry) return;
      toggleWatchlist(entry);
    });
  });
  updateWatchlistButtons();
}

function toggleWatchlist(entry) {
  if (state.watchlist.has(entry.key)) {
    state.watchlist.delete(entry.key);
  } else {
    state.watchlist.set(entry.key, entry);
  }
  renderWatchlist();
  updateWatchlistButtons();
  updateSpotlightWatchlistButton();
}

function renderWatchlist() {
  const items = [...state.watchlist.values()];
  if (!items.length) {
    elements.watchlistList.innerHTML = `<li class="watchlist-empty">Pin films to keep them handy for your next movie night.</li>`;
    return;
  }
  elements.watchlistList.innerHTML = items
    .map((entry) => {
      const filmLink = entry.film.film_link || "#";
      const firstCategory = entry.film.nominations[0]?.category || "Nominee";
      return `
        <li class="watchlist-item">
          <div>
            <a href="${filmLink}" target="_blank" rel="noreferrer">${entry.film.film_title || "Untitled"}</a>
            <p>${entry.yearLabel} · ${firstCategory}</p>
          </div>
          <button class="watchlist-remove" type="button" data-watch-remove="${entry.key}">Remove</button>
        </li>
      `;
    })
    .join("");
}

function updateWatchlistButtons() {
  document.querySelectorAll(".watchlist-toggle").forEach((button) => {
    const key = button.dataset.filmKey;
    const saved = state.watchlist.has(key);
    button.classList.toggle("saved", saved);
    button.textContent = saved ? "Saved" : "Save";
    button.setAttribute("aria-pressed", saved);
  });
}

function updateSpotlight(entries) {
  if (!entries.length) {
    elements.spotlightTitle.textContent = "Pick a filter to highlight a nominee";
    elements.spotlightMeta.textContent = "The film with the most wins automatically rises to the top.";
    elements.spotlightBadges.innerHTML = "";
    elements.spotlightLink.setAttribute("aria-disabled", "true");
    elements.spotlightLink.href = "#";
    state.spotlightEntry = null;
    updateSpotlightWatchlistButton();
    return;
  }

  let winner = entries[0];
  let bestScore = computeSpotlightScore(winner.film);
  for (const entry of entries) {
    const score = computeSpotlightScore(entry.film);
    if (score > bestScore) {
      winner = entry;
      bestScore = score;
    }
  }

  const film = winner.film;
  const winCount = film.nominations.filter((nom) => nom.winner).length;
  const nominationCount = film.nominations.length;
  const badgeMeta = [];
  badgeMeta.push(`<span class="badge">Wins: ${winCount}</span>`);
  badgeMeta.push(`<span class="badge">Nominations: ${nominationCount}</span>`);
  const topCategories = [...new Set(film.nominations.map((nom) => nom.category))]
    .filter(Boolean)
    .slice(0, 3);
  badgeMeta.push(...topCategories.map((category) => `<span class="badge">${category}</span>`));

  elements.spotlightTitle.textContent = film.film_title || "Untitled";
  elements.spotlightMeta.textContent = `${winCount} wins · ${nominationCount} nominations · ${winner.yearLabel}`;
  elements.spotlightBadges.innerHTML = badgeMeta.join("");

  if (film.film_link) {
    elements.spotlightLink.href = film.film_link;
    elements.spotlightLink.removeAttribute("aria-disabled");
  } else {
    elements.spotlightLink.href = "#";
    elements.spotlightLink.setAttribute("aria-disabled", "true");
  }

  state.spotlightEntry = winner;
  updateSpotlightWatchlistButton();
}

function computeSpotlightScore(film) {
  const wins = film.nominations.filter((nom) => nom.winner).length;
  const total = film.nominations.length;
  return wins * 100 + total;
}

function updateSpotlightWatchlistButton() {
  if (!state.spotlightEntry) {
    elements.spotlightWatchlist.disabled = true;
    elements.spotlightWatchlist.classList.remove("saved");
    elements.spotlightWatchlist.textContent = "Add to watchlist";
    elements.spotlightWatchlist.removeAttribute("aria-pressed");
    return;
  }
  elements.spotlightWatchlist.disabled = false;
  const saved = state.watchlist.has(state.spotlightEntry.key);
  elements.spotlightWatchlist.textContent = saved ? "Saved" : "Add to watchlist";
  elements.spotlightWatchlist.classList.toggle("saved", saved);
  elements.spotlightWatchlist.setAttribute("aria-pressed", saved);
}

function handleRandomPick() {
  const films = filterFilms();
  if (!films.length) {
    elements.randomMeta.textContent = "Refine your filters to unlock nominees.";
    return;
  }
  const yearBlock = getCurrentYearBlock();
  const film = films[Math.floor(Math.random() * films.length)];
  const key = getFilmKey(film, yearBlock.award_show_number);
  const entry = state.filmIndex.get(key);
  state.randomEntry = entry || {
    film,
    yearLabel: yearBlock.label,
    yearNumber: yearBlock.award_show_number,
    key,
  };
  updateRandomCard();
}

function updateRandomCard() {
  const entry = state.randomEntry;
  if (!entry) {
    elements.randomTitle.textContent = "Let the ceremony decide";
    elements.randomMeta.textContent = "Spin the wheel to spotlight another nominee.";
    return;
  }
  const film = entry.film;
  const winCount = film.nominations.filter((nom) => nom.winner).length;
  const nominationCount = film.nominations.length;
  elements.randomTitle.textContent = film.film_title || "Untitled";
  elements.randomMeta.textContent = `${winCount} wins · ${nominationCount} nominations · ${entry.yearLabel}`;
}

function openActorModal(person) {
  if (!person) return;
  elements.modal.classList.remove("hidden");
  elements.modalTitle.textContent = person;
  elements.modalSummary.textContent = "";
  elements.modalError.textContent = "";
  elements.modalThumb.style.backgroundImage = "";
  elements.modalLink.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(person)}`;
  elements.modalLink.textContent = "Read on Wikipedia";

  if (actorCache.has(person)) {
    applyActorInfo(actorCache.get(person));
    return;
  }

  const controller = new AbortController();
  modalRequest = controller;
  fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(person)}`,
    {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }
  )
    .then((response) => {
      if (!response.ok) {
        throw new Error("Profile not found");
      }
      return response.json();
    })
    .then((body) => {
      actorCache.set(person, body);
      if (modalRequest !== controller) {
        return;
      }
      applyActorInfo(body);
    })
    .catch((error) => {
      if (modalRequest !== controller) {
        return;
      }
      elements.modalError.textContent = error.message;
      elements.modalSummary.textContent = "No summary available.";
    });
}

function applyActorInfo(info) {
  if (!info) return;
  if (info.thumbnail?.source) {
    elements.modalThumb.style.backgroundImage = `url(${info.thumbnail.source})`;
  } else {
    elements.modalThumb.style.backgroundImage = "";
  }
  elements.modalSummary.textContent = info.extract || "No summary provided.";
  elements.modalLink.href = info.content_urls?.desktop?.page || info.canonical || elements.modalLink.href;
  elements.modalLink.textContent = "Read on Wikipedia";
}

function closeModal() {
  elements.modal.classList.add("hidden");
  elements.modalError.textContent = "";
  modalRequest?.abort?.();
}

let modalRequest = null;

function attachEvents() {
  elements.yearSelect.addEventListener("change", (event) => {
    state.year = Number(event.target.value);
    renderFilms();
  });
  elements.categorySelect.addEventListener("change", (event) => {
    state.category = event.target.value;
    renderFilms();
  });
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderFilms();
  });
  elements.randomButton.addEventListener("click", handleRandomPick);
  elements.spotlightWatchlist.addEventListener("click", () => {
    if (!state.spotlightEntry) return;
    toggleWatchlist(state.spotlightEntry);
  });
  elements.watchlistList.addEventListener("click", (event) => {
    const key = event.target.dataset.watchRemove;
    if (!key) return;
    state.watchlist.delete(key);
    renderWatchlist();
    updateWatchlistButtons();
    updateSpotlightWatchlistButton();
  });
  elements.modalClose.addEventListener("click", closeModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

async function init() {
  await fetchData();
  populateFilters();
  attachEvents();
  renderFilms();
  renderWatchlist();
  updateRandomCard();
}

init();
