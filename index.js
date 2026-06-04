// Application state
let conferences = [];
let activeFilters = {
  search: '',
  rank: 'all', // 'all', 'A*', 'A'
  category: 'all', // 'all', 'AI', 'DB', etc.
  status: 'upcoming' // 'upcoming', 'all'
};
let sortBy = 'deadline'; // 'deadline', 'alphabetical', 'rank'

// Category mapping helper
const CATEGORY_NAMES = {
  'AI': 'Artificial Intelligence',
  'DB': 'Databases & IR',
  'SE': 'Software Eng & PL',
  'NW': 'Networks & Dist.',
  'SC': 'Security & Privacy',
  'SYS': 'Computer Systems',
  'TH': 'Theory & Algorithms',
  'CG': 'Graphics & HCI'
};

// Document Elements
const gridEl = document.getElementById('conferences-grid');
const searchEl = document.getElementById('search-input');
const sortEl = document.getElementById('sort-select');
const rankFiltersEl = document.getElementById('rank-filters');
const statusFiltersEl = document.getElementById('status-filters');
const categoryFiltersEl = document.getElementById('category-filters');
const resultsTitleEl = document.getElementById('results-count-title');
const tzBadgeEl = document.getElementById('current-timezone-badge');
const detailModalEl = document.getElementById('detail-modal');

// Page Load
window.addEventListener('DOMContentLoaded', async () => {
  // Display detected local timezone
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  tzBadgeEl.textContent = `Local Timezone: ${localTz}`;

  // Fetch and init data
  await loadConferences();

  // Setup Event Listeners
  initListeners();
});

// Load and prepare data
async function loadConferences() {
  try {
    const res = await fetch('conferences.json');
    if (!res.ok) throw new Error('Failed to fetch conferences.json');
    
    const rawData = await res.json();
    
    // Normalize and enrich data
    conferences = rawData.map(conf => {
      // Find the latest active conference instance
      const instance = conf.confs && conf.confs.length > 0 ? conf.confs[0] : null;
      
      let nextDeadline = null;
      let isTbd = true;
      let isProjected = conf.confs[0]?.projected || false;
      let parsedDeadlines = [];

      if (instance && instance.timeline) {
        parsedDeadlines = instance.timeline.map((item, index) => {
          const dlStr = typeof item === 'object' ? item.deadline : item;
          const comment = typeof item === 'object' ? (item.comment || 'Paper Submission') : 'Paper Submission';
          const isAbstract = comment.toLowerCase().includes('abstract') || 'abstract_deadline' in item;
          
          let parsedDate = null;
          let dateStr = dlStr;
          
          if (dlStr && dlStr.toUpperCase() !== 'TBD') {
            parsedDate = parseDeadline(dlStr, instance.timezone);
          }
          
          return {
            originalStr: dlStr,
            parsedDate,
            comment,
            isAbstract,
            timezone: instance.timezone || 'AoE'
          };
        });
        
        // Find next upcoming deadline
        const now = new Date();
        const futureDeadlines = parsedDeadlines.filter(d => d.parsedDate && d.parsedDate > now);
        
        // Sort future deadlines ascending to find the nearest
        if (futureDeadlines.length > 0) {
          futureDeadlines.sort((a, b) => a.parsedDate - b.parsedDate);
          nextDeadline = futureDeadlines[0].parsedDate;
          isTbd = false;
        } else {
          // If no future deadlines, check if we have any parsed dates at all (they must be past)
          const validDates = parsedDeadlines.filter(d => d.parsedDate);
          if (validDates.length > 0) {
            // Sort descending to get the latest past deadline
            validDates.sort((a, b) => b.parsedDate - a.parsedDate);
            nextDeadline = validDates[0].parsedDate;
            isTbd = false;
          } else {
            nextDeadline = null;
            isTbd = true;
          }
        }
      }

      return {
        ...conf,
        latestInstance: instance,
        nextDeadline,
        isTbd,
        isProjected,
        parsedDeadlines
      };
    });

    renderDashboard();
    
    // Start countdown timer loop
    setInterval(updateCountdowns, 1000);
    
  } catch (err) {
    gridEl.innerHTML = `
      <div class="empty-state">
        <p>❌ Error loading database: ${err.message}</p>
        <p>Please make sure you have generated the database first using <code>python3 fetch_data.py</code>.</p>
      </div>
    `;
    console.error(err);
  }
}

// Timezone-aware date parsing helper
function parseDeadline(deadlineStr, tzStr) {
  if (!deadlineStr || deadlineStr.toUpperCase() === 'TBD') return null;
  
  // Standardize deadline string: replace space with T
  let iso = deadlineStr.trim().replace(' ', 'T');
  
  // Parse timezone offset
  let offset = '-12:00'; // Default to AoE if not specified
  if (tzStr) {
    let cleanTz = tzStr.trim().toUpperCase();
    if (cleanTz === 'AOE' || cleanTz === 'UTC-12') {
      offset = '-12:00';
    } else if (cleanTz === 'UTC' || cleanTz === 'GMT' || cleanTz === 'UTC+0') {
      offset = 'Z';
    } else {
      // Handle format UTC-8, UTC+8, UTC-08:00, etc.
      let match = cleanTz.match(/UTC([+-]\d+)(?::(\d+))?/);
      if (match) {
        let hours = parseInt(match[1]);
        let mins = match[2] ? parseInt(match[2]) : 0;
        let sign = hours >= 0 ? '+' : '-';
        let absHours = Math.abs(hours).toString().padStart(2, '0');
        let absMins = mins.toString().padStart(2, '0');
        offset = `${sign}${absHours}:${absMins}`;
      } else {
        offset = 'Z'; // Fallback
      }
    }
  }
  
  // If it already has Z or offset, don't append
  if (!iso.includes('Z') && !/[+-]\d{2}:\d{2}$/.test(iso)) {
    iso = iso + offset;
  }
  
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Helper to format local timezone date string nicely
function formatToLocal(date) {
  if (!date) return 'TBD';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Filter and render setup
function renderDashboard() {
  const filtered = filterConferences();
  sortConferences(filtered);
  
  // Update Metrics
  updateMetricsPanel();
  
  // Update section title
  resultsTitleEl.textContent = `Showing ${filtered.length} Conference${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state">
        <p>🔍 No conferences match your active filters.</p>
        <button class="btn btn-secondary" id="reset-filters-btn">Clear All Filters</button>
      </div>
    `;
    document.getElementById('reset-filters-btn')?.addEventListener('click', resetFilters);
    return;
  }

  // Render cards
  gridEl.innerHTML = filtered.map(conf => {
    const rankLabel = conf.rank.ccf === 'A' || conf.rank.core === 'A*' ? 'A*' : 'A';
    const rankClass = rankLabel === 'A*' ? 'rank-astar' : 'rank-a';
    const latest = conf.latestInstance;
    
    // Badges layout
    const badgesHtml = `
      <span class="badge rank-badge-${rankLabel}">${rankLabel} Rank</span>
      <span class="badge category-badge">${conf.category}</span>
      ${conf.isProjected ? '<span class="badge projected-badge">Projected</span>' : ''}
    `;

    // Deadlines layout inside card
    let deadlineRowsHtml = '';
    if (conf.parsedDeadlines && conf.parsedDeadlines.length > 0) {
      deadlineRowsHtml = conf.parsedDeadlines.map(d => {
        const isPassed = d.parsedDate && d.parsedDate < new Date();
        const dateDisplay = d.parsedDate ? formatToLocal(d.parsedDate) : 'TBD';
        
        return `
          <div class="timeline-deadline-row ${isPassed ? 'passed' : ''}">
            <div class="timeline-row-header">
              <span class="timeline-row-comment">${d.comment}</span>
              <span class="timezone-label">${d.timezone}</span>
            </div>
            <div class="timeline-row-date">${d.originalStr}</div>
            <div class="timeline-row-local-date">
              <span>🏠 Local:</span>
              <span>${dateDisplay}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // Next deadline data-attributes for countdown
    let countdownAttr = 'data-tbd="true"';
    if (conf.nextDeadline && !conf.isTbd) {
      const now = new Date();
      if (conf.nextDeadline > now) {
        countdownAttr = `data-deadline-utc="${conf.nextDeadline.toISOString()}"`;
      } else {
        countdownAttr = `data-deadline-utc="${conf.nextDeadline.toISOString()}" data-passed="true"`;
      }
    }

    return `
      <article class="conf-card ${rankClass}" data-id="${conf.title}">
        <div class="card-header">
          <div class="card-badges">${badgesHtml}</div>
          <div class="card-actions-row">
            ${conf.nextDeadline && !conf.isTbd && conf.nextDeadline > new Date() ? `
              <button class="quick-action-btn" title="Add nearest deadline to Google Calendar" data-action="gcal" data-id="${conf.title}">📅</button>
              <button class="quick-action-btn" title="Download .ics event file" data-action="ics" data-id="${conf.title}">📥</button>
            ` : ''}
          </div>
        </div>

        <div class="card-title-area">
          <div class="card-title-row">
            <span class="conf-acronym">${conf.title}</span>
            <span class="conf-year">${latest?.year || ''}</span>
          </div>
          <span class="conf-fullname" title="${conf.description}">${conf.description}</span>
        </div>

        <div class="conf-details-list">
          <div class="detail-item">
            <span class="detail-icon">📍</span>
            <span>${latest?.place || 'TBD'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-icon">📅</span>
            <span>${latest?.date || 'TBD'}</span>
          </div>
        </div>

        <div class="card-timeline-area">
          ${deadlineRowsHtml}
        </div>

        <div class="countdown-container" ${countdownAttr}>
          <div class="countdown-timer">
            <!-- Dynamically ticking -->
            <div class="timer-segment">
              <span class="timer-unit-val">-</span>
              <span class="timer-unit-lbl">d</span>
            </div>
            <div class="timer-segment">
              <span class="timer-unit-val">-</span>
              <span class="timer-unit-lbl">h</span>
            </div>
            <div class="timer-segment">
              <span class="timer-unit-val">-</span>
              <span class="timer-unit-lbl">m</span>
            </div>
            <div class="timer-segment">
              <span class="timer-unit-val">-</span>
              <span class="timer-unit-lbl">s</span>
            </div>
          </div>
          <div class="status-pulse"></div>
        </div>
      </article>
    `;
  }).join('');

  // Add click listeners to cards and buttons
  document.querySelectorAll('.conf-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Ignore click if it's on quick actions
      if (e.target.closest('.quick-action-btn')) {
        const btn = e.target.closest('.quick-action-btn');
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const conf = conferences.find(c => c.title === id);
        
        if (action === 'gcal') {
          exportToGoogleCalendar(conf);
        } else if (action === 'ics') {
          exportToICS(conf);
        }
        return;
      }
      
      const id = card.getAttribute('data-id');
      openDetailModal(id);
    });
  });
  
  // Tick immediately
  updateCountdowns();
}

// Search and filter logic
function filterConferences() {
  const now = new Date();
  
  return conferences.filter(conf => {
    // Search query match
    if (activeFilters.search) {
      const q = activeFilters.search.toLowerCase();
      const matchTitle = conf.title.toLowerCase().includes(q);
      const matchDesc = conf.description.toLowerCase().includes(q);
      const matchPlace = (conf.latestInstance?.place || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchPlace) return false;
    }

    // Rank filter match
    if (activeFilters.rank !== 'all') {
      const cardRank = conf.rank.ccf === 'A' || conf.rank.core === 'A*' ? 'A*' : 'A';
      if (cardRank !== activeFilters.rank) return false;
    }

    // Category match
    if (activeFilters.category !== 'all') {
      if (conf.category !== activeFilters.category) return false;
    }

    // Status filter match
    if (activeFilters.status === 'upcoming') {
      // Keep if TBD, projected, or there is at least one active deadline in the future
      if (conf.isTbd || conf.isProjected) return true;
      if (!conf.nextDeadline) return false;
      
      // Check if all timeline deadlines are already passed
      const hasFuture = conf.parsedDeadlines.some(d => !d.parsedDate || d.parsedDate > now);
      if (!hasFuture) return false;
    }

    return true;
  });
}

// Sorter
function sortConferences(list) {
  const now = new Date();
  
  list.sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return a.title.localeCompare(b.title);
    }
    
    if (sortBy === 'rank') {
      const rankAVal = (a.rank.core === 'A*' || a.rank.ccf === 'A') ? 2 : 1;
      const rankBVal = (b.rank.core === 'A*' || b.rank.ccf === 'A') ? 2 : 1;
      if (rankAVal !== rankBVal) {
        return rankBVal - rankAVal; // Higher rank first
      }
      return a.title.localeCompare(b.title);
    }
    
    if (sortBy === 'deadline') {
      // Sorting by closest deadline
      // Handle TBD / Projected
      if (a.isTbd && b.isTbd) return a.title.localeCompare(b.title);
      if (a.isTbd) return 1; // Put TBDs at the end
      if (b.isTbd) return -1;
      
      // Active upcoming deadlines go first, ordered ascending
      // Passed deadlines go last
      const aUpcoming = a.nextDeadline > now;
      const bUpcoming = b.nextDeadline > now;
      
      if (aUpcoming && bUpcoming) {
        return a.nextDeadline - b.nextDeadline;
      }
      if (aUpcoming) return -1; // Upcoming first
      if (bUpcoming) return 1;
      
      // Both are passed: sort by date descending (most recent past first)
      return b.nextDeadline - a.nextDeadline;
    }
    
    return 0;
  });
}

// Countdown Tick loop function
function updateCountdowns() {
  const now = new Date();
  
  document.querySelectorAll('.countdown-container').forEach(container => {
    const isTbd = container.hasAttribute('data-tbd');
    const timerEl = container.querySelector('.countdown-timer');
    
    if (isTbd) {
      container.classList.add('tbd');
      timerEl.innerHTML = `
        <div style="font-size:0.85rem; font-weight:600; color:var(--text-secondary)">
          ⏳ DEADLINE TO BE ANNOUNCED
        </div>
      `;
      return;
    }
    
    const deadlineUtc = container.getAttribute('data-deadline-utc');
    if (!deadlineUtc) return;
    
    const deadlineDate = new Date(deadlineUtc);
    const diff = deadlineDate - now;
    
    if (diff <= 0) {
      container.classList.add('passed');
      timerEl.innerHTML = `
        <div style="font-size:0.85rem; font-weight:600; color:var(--text-muted)">
          PASSED (DEADLINE OVER)
        </div>
      `;
      return;
    }
    
    // Calculate values
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    
    // Update segments
    timerEl.innerHTML = `
      <div class="timer-segment">
        <span class="timer-unit-val">${days.toString().padStart(2, '0')}</span>
        <span class="timer-unit-lbl">d</span>
      </div>
      <div class="timer-segment">
        <span class="timer-unit-val">${hours.toString().padStart(2, '0')}</span>
        <span class="timer-unit-lbl">h</span>
      </div>
      <div class="timer-segment">
        <span class="timer-unit-val">${mins.toString().padStart(2, '0')}</span>
        <span class="timer-unit-lbl">m</span>
      </div>
      <div class="timer-segment">
        <span class="timer-unit-val">${secs.toString().padStart(2, '0')}</span>
        <span class="timer-unit-lbl">s</span>
      </div>
    `;
  });
}

// Panel metrics calculator
function updateMetricsPanel() {
  document.getElementById('stat-total-confs').textContent = conferences.length;
  
  // A* vs A counts
  const aStarCount = conferences.filter(c => c.rank.core === 'A*' || c.rank.ccf === 'A').length;
  document.getElementById('stat-astar').textContent = aStarCount;
  document.getElementById('stat-arank').textContent = conferences.length - aStarCount;

  // Upcoming in next 30 days
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  
  const upcomingCount = conferences.filter(c => {
    if (c.isTbd) return false;
    return c.nextDeadline && c.nextDeadline > now && c.nextDeadline <= thirtyDaysLater;
  }).length;

  document.getElementById('stat-upcoming').textContent = upcomingCount;
}

// Modal open details logic
function openDetailModal(id) {
  const conf = conferences.find(c => c.title === id);
  if (!conf) return;

  const contentEl = document.getElementById('modal-content');
  const rankLabel = conf.rank.ccf === 'A' || conf.rank.core === 'A*' ? 'A*' : 'A';
  const latest = conf.latestInstance;

  // Timeline render inside modal
  let timelineItemsHtml = '<li>No deadlines announced yet</li>';
  if (conf.parsedDeadlines && conf.parsedDeadlines.length > 0) {
    timelineItemsHtml = conf.parsedDeadlines.map(d => {
      const isPassed = d.parsedDate && d.parsedDate < new Date();
      const dateDisplay = d.parsedDate ? formatToLocal(d.parsedDate) : 'TBD';
      
      return `
        <div class="modal-timeline-item ${isPassed ? 'passed' : ''}">
          <div class="modal-tl-left">
            <span class="modal-tl-label">${d.comment}</span>
            <span class="modal-tl-comment">Timezone: ${d.timezone}</span>
          </div>
          <div class="modal-tl-right">
            <span class="modal-tl-date">${d.originalStr}</span>
            <span class="modal-tl-local">🏠 Local: ${dateDisplay}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  contentEl.innerHTML = `
    <button class="modal-close-btn" id="modal-close-btn" aria-label="Close modal">✕</button>
    
    <div class="modal-header">
      <div class="modal-title-row">
        <h2 class="modal-acronym">${conf.title}</h2>
        <span class="modal-year">${latest?.year || ''}</span>
        <span class="badge rank-badge-${rankLabel}">${rankLabel} Rank</span>
        ${conf.isProjected ? '<span class="badge projected-badge">Projected Date</span>' : ''}
      </div>
      <p class="modal-desc">${conf.description}</p>
    </div>

    <div class="modal-meta-grid">
      <div class="modal-meta-item">
        <span class="modal-meta-label">Location</span>
        <span class="modal-meta-val">📍 ${latest?.place || 'TBD'}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">Conference Dates</span>
        <span class="modal-meta-val">📅 ${latest?.date || 'TBD'}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">CCF Rank</span>
        <span class="modal-meta-val">⭐ ${conf.rank.ccf || 'Unranked'}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">CORE Rank</span>
        <span class="modal-meta-val">⭐ ${conf.rank.core || 'Unranked'}</span>
      </div>
    </div>

    <div class="modal-timeline-section">
      <h3 class="modal-section-title">Submission Schedule</h3>
      <div class="modal-timeline">
        ${timelineItemsHtml}
      </div>
    </div>

    <div class="modal-actions">
      ${latest?.link ? `
        <a href="${latest.link}" target="_blank" rel="noopener" class="btn btn-primary">
          🌐 Official Website
        </a>
      ` : ''}
      <a href="https://dblp.org/db/conf/${conf.dblp || ''}" target="_blank" rel="noopener" class="btn btn-secondary">
        📚 View DBLP Publications
      </a>
      ${conf.nextDeadline && !conf.isTbd && conf.nextDeadline > new Date() ? `
        <button class="btn btn-secondary" id="modal-gcal-btn">📅 Add to Google Calendar</button>
        <button class="btn btn-secondary" id="modal-ics-btn">📥 Download ICS File</button>
      ` : ''}
    </div>
  `;

  // Attach buttons inside modal
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    detailModalEl.close();
  });
  
  // Close modal when clicking backdrop
  detailModalEl.addEventListener('click', (e) => {
    const dialogDimensions = detailModalEl.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      detailModalEl.close();
    }
  });

  const modalGcalBtn = document.getElementById('modal-gcal-btn');
  const modalIcsBtn = document.getElementById('modal-ics-btn');
  
  if (modalGcalBtn) {
    modalGcalBtn.addEventListener('click', () => exportToGoogleCalendar(conf));
  }
  if (modalIcsBtn) {
    modalIcsBtn.addEventListener('click', () => exportToICS(conf));
  }

  detailModalEl.showModal();
}

// Google Calendar link generator
function exportToGoogleCalendar(conf) {
  if (!conf.nextDeadline) return;
  
  const start = conf.nextDeadline;
  // Make event 1 hour long
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  
  const formatGCalDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  const dates = `${formatGCalDate(start)}/${formatGCalDate(end)}`;
  const title = encodeURIComponent(`[Deadline] ${conf.title} ${conf.latestInstance.year}`);
  const details = encodeURIComponent(`Abstract/Paper submission deadline for ${conf.description}.\nWebsite: ${conf.latestInstance.link}`);
  const location = encodeURIComponent(conf.latestInstance.place);
  
  const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
  window.open(url, '_blank');
}

// ICS file generator
function exportToICS(conf) {
  if (!conf.nextDeadline) return;
  
  const start = conf.nextDeadline;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  
  const formatICSDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  const stamp = formatICSDate(new Date());
  
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CS Conference Tracker//EN',
    'BEGIN:VEVENT',
    `UID:${conf.title.toLowerCase()}-${conf.latestInstance.year}-deadline@csconftracker`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:Deadline: ${conf.title} ${conf.latestInstance.year}`,
    `DESCRIPTION:Submission deadline for ${conf.description}. Website: ${conf.latestInstance.link}`,
    `LOCATION:${conf.latestInstance.place}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  
  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${conf.title.toLowerCase()}_deadline.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Reset filters callback
function resetFilters() {
  activeFilters.search = '';
  activeFilters.rank = 'all';
  activeFilters.category = 'all';
  activeFilters.status = 'upcoming';
  sortBy = 'deadline';
  
  // Sync HTML inputs
  searchEl.value = '';
  sortEl.value = 'deadline';
  
  document.querySelectorAll('#rank-filters .pill').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-rank') === 'all');
  });
  document.querySelectorAll('#status-filters .pill').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-status') === 'upcoming');
  });
  document.querySelectorAll('#category-filters .category-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-cat') === 'all');
  });
  
  renderDashboard();
}

// Listeners Setup
function initListeners() {
  // Search
  searchEl.addEventListener('input', (e) => {
    activeFilters.search = e.target.value;
    renderDashboard();
  });

  // Sort
  sortEl.addEventListener('change', (e) => {
    sortBy = e.target.value;
    renderDashboard();
  });

  // Rank pills
  rankFiltersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    
    rankFiltersEl.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    activeFilters.rank = btn.getAttribute('data-rank');
    renderDashboard();
  });

  // Status pills (Upcoming vs All)
  statusFiltersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    
    statusFiltersEl.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    activeFilters.status = btn.getAttribute('data-status');
    renderDashboard();
  });

  // Category filters buttons
  categoryFiltersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;
    
    categoryFiltersEl.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    activeFilters.category = btn.getAttribute('data-cat');
    renderDashboard();
  });
}
