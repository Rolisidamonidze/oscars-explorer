const state = {
  data: null,
  year: "",
  category: "",
  search: "",
  winnersOnly: true,
};

const filmImageCache = new Map();

const elements = {
  yearSelect: document.getElementById("yearSelect"),
  categorySelect: document.getElementById("categorySelect"),
  searchInput: document.getElementById("searchInput"),
  winnersOnly: document.getElementById("winnersOnly"),
  filmList: document.getElementById("filmList"),
  statsYears: document.getElementById("statYears"),
  statsFilms: document.getElementById("statFilms"),
  statsCategories: document.getElementById("statCategories"),
  modal: document.getElementById("actorModal"),
  modalTitle: document.getElementById("actorModalTitle"),
  modalSummary: document.getElementById("modalSummary"),
  modalLink: document.getElementById("modalLink"),
  modalClose: document.getElementById("modalClose"),
  loading: document.getElementById("loading"),
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
  const baseValue = bestPicture || "";
  const baseLabel = bestPicture || "Best Picture";
  elements.categorySelect.innerHTML = [
    `<option value=\"${baseValue}\">${baseLabel}</option>`,
    ...state.data.categories.map((cat) => `<option value=\"${cat}\">${cat}</option>`),
    "<option value=\"\">All categories</option>",
  ].join("");
  state.category = baseValue;
  elements.categorySelect.value = baseValue;

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
  const blocks = state.year
    ? [getYearBlock()]
    : [...state.data.years].sort((a, b) => b.award_show_number - a.award_show_number);
  const entries = blocks.flatMap((yearBlock) =>
    yearBlock.films
      .filter((film) => {
        const activeCategory = state.category || findBestPictureCategory();
        if (state.winnersOnly && activeCategory) {
          const hasWinner = film.nominations.some((nom) => nom.winner && nom.category === activeCategory);
          if (!hasWinner) return false;
        } else if (state.winnersOnly && !activeCategory) {
          return false;
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
  const activeCategory = state.category || findBestPictureCategory();
  elements.filmList.innerHTML = entries
    .map(({ film, yearLabel }) => {
      const key = getFilmKey(film, yearLabel);
      const wins = film.nominations.filter((nom) => nom.winner).length;
      const hasCategoryWinner = activeCategory
        ? film.nominations.some((nom) => nom.winner && nom.category === activeCategory)
        : wins > 0;
      const winnerBadge = hasCategoryWinner
        ? `<span class="winner-badge">Winner</span>`
        : "";
      return `
        <article class="film-card">
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
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".person-chip").forEach((chip) => {
    chip.addEventListener("click", () => openActorModal(chip.dataset.person));
  });

  await populateFilmImages(entries);
}

async function populateFilmImages(entries) {
  for (const { film, yearLabel } of entries) {
    const title = film.film_title;
    if (!title) continue;
    const url = await fetchFilmImage(title);
    const thumb = document.querySelector(`[data-film-key="${getFilmKey(film, yearLabel)}"]`);
    if (!thumb) continue;
    if (!url) {
      thumb.classList.add("placeholder");
      continue;
    }
    thumb.classList.remove("placeholder");
    thumb.style.backgroundImage = `url(${url})`;
  }
}

async function fetchFilmImage(title) {
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

  const candidates = [title, `${title} film`];
  let thumb = null;
  for (const candidate of candidates) {
    thumb = await fetchSummaryImage(candidate);
    if (thumb) break;
  }
  if (!thumb) {
    thumb = await searchThenSummary(title);
  }

  filmImageCache.set(cacheKey, thumb);
  return thumb;
}

function openActorModal(person) {
  if (!person) return;
  elements.modal.classList.remove("hidden");
  elements.modalTitle.textContent = person;
  elements.modalSummary.textContent = "Loading…";
  elements.modalLink.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(person)}`;
  elements.modalLink.textContent = "Read more";
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(person)}`)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((payload) => {
      elements.modalSummary.textContent = payload.extract || "No summary available.";
    })
    .catch(() => {
      elements.modalSummary.textContent = "No summary available.";
    });
}

function closeModal() {
  elements.modal.classList.add("hidden");
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
  elements.modalClose.addEventListener("click", closeModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
  });
}

async function init() {
  await fetchData();
  populateFilters();
  attachEvents();
  renderFilms();
}

init();
