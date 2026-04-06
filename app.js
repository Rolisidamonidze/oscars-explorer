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

function populateFilters() {
  const years = state.data.years;
  elements.yearSelect.innerHTML = years
    .map((year) => `<option value="${year.award_show_number}">${year.label}</option>`)
    .join("");
  state.year = years[years.length - 1]?.award_show_number || years[0]?.award_show_number;
  elements.yearSelect.value = state.year;

  elements.categorySelect.innerHTML = [
    "<option value=\"\">All</option>",
    ...state.data.categories.map((cat) => `<option value="${cat}">${cat}</option>`),
  ].join("");

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
  const yearBlock = getYearBlock();
  const search = state.search.trim().toLowerCase();
  return yearBlock.films.filter((film) => {
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
  });
}

function renderFilms() {
  const films = filterFilms();
  if (!films.length) {
    elements.filmList.innerHTML = `<p class="empty">No results.</p>`;
    return;
  }
  const yearBlock = getYearBlock();
  elements.filmList.innerHTML = films
    .map((film) => {
      const people = film.nominations
        .flatMap((nom) => nom.people || [])
        .slice(0, 3)
        .map((person) => `<button class="person-chip" data-person="${person}">${person}</button>`)
        .join(" ");
      const nominationItems = film.nominations
        .map((nom) => `<li class="nomination"><strong>${nom.category}</strong><span>${nom.nomination_statement || ""}</span></li>`)
        .join("");
      return `
        <article class="film-card">
          <div>
            <p class="film-year">${yearBlock.label}</p>
            <h3>${film.film_title}</h3>
          </div>
          <div class="film-meta">${film.production_companies || ""}</div>
          <ul class="nomination-list">${nominationItems}</ul>
          <div class="film-people">${people}</div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".person-chip").forEach((chip) => {
    chip.addEventListener("click", () => openActorModal(chip.dataset.person));
  });
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
