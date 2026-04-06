const state = {
  data: null,
  year: "",
  category: "",
  search: "",
  winnersOnly: true,
};

const STORAGE_KEY = "oscars-film-images";
const filmImageCache = new Map();

function loadCacheFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([key, value]) => {
      filmImageCache.set(key, value);
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persistImageCache() {
  const entries = {};
  filmImageCache.forEach((value, key) => {
    entries[key] = value;
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage quota may fail; ignore
  }
}
const manualImageQueries = new Map([
  ["coda", ["CODA (film)", "CODA (2021 film)"]],
  ["the artist", ["The Artist (film)"]],
  ["spotlight", ["Spotlight (film)", "Spotlight (2015 film)"]],
  ["amadeus", ["Amadeus (film)"]],
]);

function extractYearSnippet(label) {
  if (!label) return "";
  const mainItem = label.split(" ")[0] || label;
  return mainItem.replace(/[^\d/]/g, "");
}

const filmRegistry = new Map();

const elements = {
  yearSelect: document.getElementById("yearSelect"),
  categorySelect: document.getElementById("categorySelect"),
  searchInput: document.getElementById("searchInput"),
  winnersOnly: document.getElementById("winnersOnly"),
  filmList: document.getElementById("filmList"),
  statsYears: document.getElementById("statYears"),
  statsFilms: document.getElementById("statFilms"),
  statsCategories: document.getElementById("statCategories"),
  filmModal: document.getElementById("filmModal"),
  filmModalThumb: document.getElementById("filmModalThumb"),
  filmModalTitle: document.getElementById("filmModalTitle"),
  filmModalSubline: document.getElementById("filmModalSubline"),
  filmModalSummary: document.getElementById("filmModalSummary"),
  filmModalNominations: document.getElementById("filmModalNominations"),
  filmModalClose: document.getElementById("filmModalClose"),
  loading: document.getElementById("loading"),
  filmModalProduction: document.getElementById("filmModalProduction"),
  filmModalDistributor: document.getElementById("filmModalDistributor"),
};

async function fetchData() {
  elements.loading.classList.remove("hidden");
  try {
    const response = await fetch("data/oscars.json");
    if (!response.ok) throw new Error("Unable to load data");
    state.data = await response.json();
  } finally {
    elements.loading.classList.add("hidden");
  }
}

function findBestPictureCategory() {
  const target = "best picture";
  const exact = state.data.categories.find((cat) => cat.toLowerCase() === target);
  if (exact) return exact;
  return state.data.categories.find((cat) => cat.toLowerCase().includes(target)) || "";
}

function populateFilters() {
  const years = state.data.years;
  elements.yearSelect.innerHTML = [
    "<option value=\"\">All years</option>",
    ...years.map((year) => `<option value=\"${year.award_show_number}\">${year.label}</option>`),
  ].join("");
  state.year = "";
  elements.yearSelect.value = "";

  const bestPicture = findBestPictureCategory();
  const uniqueCategories = Array.from(new Set(state.data.categories));
  const filteredCategories = uniqueCategories.filter((cat) => cat !== bestPicture);
  elements.categorySelect.innerHTML = [
    "<option value=\"\">All categories</option>",
    `<option value=\"${bestPicture}\">${bestPicture}</option>`,
    ...filteredCategories.map((cat) => `<option value=\"${cat}\">${cat}</option>`),
  ].join("");
  state.category = bestPicture || "";
  elements.categorySelect.value = state.category;

  updateStats();
}

function updateStats() {
  if (!state.data) return;
  elements.statsYears.textContent = `${state.data.stats.year_count} ceremonies`;
  elements.statsFilms.textContent = `${state.data.stats.film_count} films`;
  elements.statsCategories.textContent = `${state.data.stats.category_count} categories`;
}

function getYearBlock() {
  const yearValue = Number(state.year);
  return state.data.years.find((year) => year.award_show_number === yearValue) || state.data.years[state.data.years.length - 1];
}

function filterFilms() {
  const search = state.search.trim().toLowerCase();
  const activeCategory = state.category || null;
  const blocks = state.year
    ? [getYearBlock()]
    : [...state.data.years].sort((a, b) => b.award_show_number - a.award_show_number);
  const entries = blocks.flatMap((yearBlock) =>
    yearBlock.films
      .filter((film) => {
        if (state.winnersOnly) {
          if (activeCategory) {
            const hasWinner = film.nominations.some(
              (nom) => nom.winner && nom.category === activeCategory
            );
            if (!hasWinner) return false;
          } else {
            const hasAnyWinner = film.nominations.some((nom) => nom.winner);
            if (!hasAnyWinner) return false;
          }
        }
        if (state.category) {
          const hasCategory = film.nominations.some((nom) => nom.category === state.category);
          if (!hasCategory) return false;
        }
        if (!search) return true;
        const fields = [film.film_title, film.production_companies, film.distributors]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (fields.includes(search)) return true;
        return film.nominations.some((nom) => {
          const combined = [nom.category, nom.nomination_statement, ...(nom.people || [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return combined.includes(search);
        });
      })
      .map((film) => ({ film, yearLabel: yearBlock.label, yearNumber: yearBlock.award_show_number }))
  );
  return entries.sort((a, b) => b.yearNumber - a.yearNumber);
}

function getFilmKey(film, yearLabel) {
  const title = (film.film_title || "untitled").toLowerCase();
  return `${yearLabel}-${title}`.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function renderFilms() {
  const entries = filterFilms();
  if (!entries.length) {
    elements.filmList.innerHTML = `<p class="empty">No results.</p>`;
    return;
  }
  const filterCategory = state.category || null;
  filmRegistry.clear();
  elements.filmList.innerHTML = entries
    .map(({ film, yearLabel, yearNumber }) => {
      const key = getFilmKey(film, yearLabel);
      filmRegistry.set(key, { film, yearLabel, yearNumber });
      const wins = film.nominations.filter((nom) => nom.winner).length;
      const hasCategoryWinner = filterCategory
        ? film.nominations.some((nom) => nom.winner && nom.category === filterCategory)
        : wins > 0;
      const winnerBadge = hasCategoryWinner
        ? `<span class="winner-badge">Winner</span>`
        : "";
      const winnerNoms = filterCategory
        ? []
        : film.nominations.filter((nom) => nom.winner);
      const detailText = winnerNoms
        .slice(0, 2)
        .map((nom) => {
          const heads = nom.nomination_statement || nom.people?.[0] || "";
          const people = (nom.people || []).join(", ");
          const label = nom.category ? `${nom.category}: ` : "";
          return `${label}${heads || people || "Winner"}`;
        })
        .filter(Boolean)
        .join(" · ");
      const detailBlock = detailText
        ? `<div class="film-detail">${detailText}</div>`
        : "";
      return `
        <article class="film-card" data-film-key="${key}">
          <figure class="film-thumb" data-film-key="${key}" aria-hidden="true">
            ${winnerBadge}
          </figure>
          <div class="film-info">
            <h3>${film.film_title}</h3>
            <div class="film-meta">
              <span>${yearLabel}</span>
              <span>${wins} win${wins === 1 ? "" : "s"}</span>
              <span>${film.nominations.length} nominations</span>
            </div>
            ${detailBlock}
          </div>
        </article>
      `;
    })
    .join("");

  await populateFilmImages(entries);
}

async function populateFilmImages(entries) {
  for (const { film, yearLabel } of entries) {
    const title = film.film_title;
    if (!title) continue;
    const url = await fetchFilmImage(title, yearLabel);
    const thumb = document.querySelector(`.film-thumb[data-film-key="${getFilmKey(film, yearLabel)}"]`);
    if (!thumb) continue;
    if (!url) {
      thumb.classList.add("placeholder");
      continue;
    }
    thumb.classList.remove("placeholder");
    thumb.style.backgroundImage = `url(${url})`;
  }
}

async function openFilmModal(entry) {
  const { film, yearLabel } = entry;
  elements.filmModalTitle.textContent = film.film_title || "Untitled film";
  const sublineParts = [yearLabel];
  if (film.production_companies) sublineParts.push(film.production_companies);
  if (film.distributors) sublineParts.push(film.distributors);
  elements.filmModalSubline.textContent = sublineParts.join(" • ");
  elements.filmModalProduction.textContent = film.production_companies || "";
  elements.filmModalDistributor.textContent = film.distributors || "";
  const summaryParts = [];
  if (film.production_companies) summaryParts.push(`Production: ${film.production_companies}`);
  if (film.distributors) summaryParts.push(`Distributor: ${film.distributors}`);
  elements.filmModalSummary.textContent =
    summaryParts.join(" | ") || "Complete nomination breakdown below.";
  const nominationsHtml = film.nominations
    .map((nom) => {
      const people = (nom.people || []).filter(Boolean).join(", ");
      const characters = (nom.characters || []).filter(Boolean).join(", ");
      const statement = nom.nomination_statement ? `<span>${nom.nomination_statement}</span>` : "";
      const extras = [people && `<span>People: ${people}</span>`, characters && `<span>Characters: ${characters}</span>`]
        .filter(Boolean)
        .join("");
      return `
        <li class="film-modal-nomination ${nom.winner ? "is-winner" : ""}">
          <strong>${nom.category}${nom.winner ? " • Winner" : ""}</strong>
          ${statement}
          ${extras}
        </li>
      `;
    })
    .join("");
  elements.filmModalNominations.innerHTML =
    nominationsHtml || '<li class="film-modal-nomination">No nominations recorded.</li>';
  const cacheKey = film.film_title?.trim().toLowerCase() || "";
  let thumbUrl = cacheKey ? filmImageCache.get(cacheKey) : null;
  if (!thumbUrl && cacheKey) {
    thumbUrl = await fetchFilmImage(film.film_title, yearLabel);
  }
  if (thumbUrl) {
    elements.filmModalThumb.style.backgroundImage = `url(${thumbUrl})`;
    elements.filmModalThumb.classList.remove("hidden");
  } else {
    elements.filmModalThumb.style.backgroundImage = "";
    elements.filmModalThumb.classList.add("hidden");
  }
  elements.filmModal.classList.remove("hidden");
}

function closeFilmModal() {
  elements.filmModal.classList.add("hidden");
}

async function fetchFilmImage(title, yearLabel) {
  const cacheKey = title.trim().toLowerCase();
  if (filmImageCache.has(cacheKey)) {
    return filmImageCache.get(cacheKey);
  }

  const fetchSummaryImage = async (query) => {
    try {
      const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.thumbnail?.source || data.originalimage?.source || null;
    } catch (error) {
      return null;
    }
  };

  const searchThenSummary = async (query) => {
    try {
      const searchResp = await fetch(
        `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=1`
      );
      if (!searchResp.ok) return null;
      const payload = await searchResp.json();
      const bestMatch = payload.pages?.[0]?.title;
      if (!bestMatch) return null;
      return fetchSummaryImage(bestMatch);
    } catch (error) {
      return null;
    }
  };

  const tryCandidate = async (candidate) => {
    const summary = await fetchSummaryImage(candidate);
    if (summary) return summary;
    return searchThenSummary(candidate);
  };

  const yearSnippet = extractYearSnippet(yearLabel);
  const overrideQueries = manualImageQueries.get(cacheKey) || [];
  const baseVariants = [
    `${title} (film)`,
    `${title} (movie)`,
    `${title} film`,
    `${title} movie`,
  ];
  const yearVariants = yearSnippet
    ? [
        `${title} ${yearSnippet}`,
        `${title} ${yearSnippet} (film)`,
        `${title} ${yearSnippet} (movie)`,
        `${title} ${yearSnippet} movie`,
      ]
    : [];
  const candidates = [...baseVariants, ...yearVariants, title, ...overrideQueries].filter(Boolean);
  let thumb = null;
  for (const candidate of candidates) {
    thumb = await tryCandidate(candidate);
    if (thumb) break;
  }
  if (!thumb) {
    thumb = await searchThenSummary(title);
  }

  filmImageCache.set(cacheKey, thumb);
  persistImageCache();
  return thumb;
}

function attachEvents() {
  elements.yearSelect.addEventListener("change", (event) => {
    state.year = event.target.value;
    renderFilms();
    updateStats();
  });
  elements.categorySelect.addEventListener("change", (event) => {
    state.category = event.target.value;
    renderFilms();
  });
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderFilms();
    updateStats();
  });
  elements.winnersOnly.addEventListener("change", (event) => {
    state.winnersOnly = event.target.checked;
    renderFilms();
  });
  elements.filmList.addEventListener("click", async (event) => {
    const card = event.target.closest(".film-card");
    if (!card) return;
    const entry = filmRegistry.get(card.dataset.filmKey);
    if (!entry) return;
    event.preventDefault();
    await openFilmModal(entry);
  });
  elements.filmModalClose.addEventListener("click", closeFilmModal);
  elements.filmModal.addEventListener("click", (event) => {
    if (event.target === elements.filmModal) closeFilmModal();
  });
}

async function init() {
  loadCacheFromStorage();
  await fetchData();
  populateFilters();
  attachEvents();
  renderFilms();
}

init();
