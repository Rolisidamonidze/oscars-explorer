const state = {
  data: null,
  year: null,
  category: "",
  search: "",
};

const elements = {
  yearSelect: document.getElementById("yearSelect"),
  categorySelect: document.getElementById("categorySelect"),
  searchInput: document.getElementById("searchInput"),
  filmList: document.getElementById("filmList"),
  statsYears: document.getElementById("statYears"),
  statsFilms: document.getElementById("statFilms"),
  statsCategories: document.getElementById("statCategories"),
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
const filmImageCache = new Map();
let modalRequest = null;

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

  if (!films.length) {
    elements.filmList.innerHTML = `<p class="muted">No films match the current filters.</p>`;
    return;
  }

  const filmEntries = [];
  elements.filmList.innerHTML = films
    .map((film) => {
      const key = getFilmKey(film, yearBlock.award_show_number);
      filmEntries.push({ film, key });
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

      return `
        <article class="film-card" data-film-key="${key}">
          <div class="film-thumb" aria-hidden="true"></div>
          <div class="film-card-body">
            <div>
              <p class="film-year">${yearBlock.label}</p>
              <h3>${film.film_title || "Untitled"}</h3>
            </div>
            <div class="film-meta">
              ${film.production_companies ? `<span>${film.production_companies}</span>` : ""}
              ${film.distributors ? `<span>${film.distributors}</span>` : ""}
            </div>
            <ul class="nomination-list">${nominationItems}</ul>
          </div>
        </article>
      `;
    })
    .join("");

  attachFilmInteractions();
  populateFilmImages(filmEntries);
}

function populateFilmImages(entries) {
  entries.forEach(async ({ film, key }) => {
    const title = film.film_title;
    if (!title) return;
    const imageUrl = await fetchFilmImage(title);
    if (!imageUrl) return;
    const container = document.querySelector(`[data-film-key="${key}"] .film-thumb`);
    if (!container) return;
    container.style.backgroundImage = `url(${imageUrl})`;
    container.classList.add("has-image");
  });
}

async function fetchFilmImage(title) {
  const cacheKey = title.trim().toLowerCase();
  if (filmImageCache.has(cacheKey)) {
    return filmImageCache.get(cacheKey);
  }

  try {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!response.ok) {
      filmImageCache.set(cacheKey, null);
      return null;
    }
    const payload = await response.json();
    const imageUrl = payload.thumbnail?.source || null;
    filmImageCache.set(cacheKey, imageUrl);
    return imageUrl;
  } catch {
    filmImageCache.set(cacheKey, null);
    return null;
  }
}

function attachFilmInteractions() {
  document.querySelectorAll(".person-chip").forEach((chip) => {
    chip.addEventListener("click", (event) => {
      const person = event.currentTarget.dataset.person;
      openActorModal(person);
    });
  });
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
}

function closeModal() {
  elements.modal.classList.add("hidden");
  elements.modalError.textContent = "";
  modalRequest?.abort?.();
}

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
}

init();
