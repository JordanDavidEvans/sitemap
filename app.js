const sitemapInput = document.getElementById('sitemap-input');
const sitemapDropzone = document.getElementById('sitemap-dropzone');
const sitemapStatus = document.getElementById('sitemap-status');
const sitemapResults = document.getElementById('sitemap-results');
const slugCount = document.getElementById('slug-count');
const slugPreview = document.getElementById('slug-preview');
const slugOptions = document.getElementById('slug-options');
const downloadSlugs = document.getElementById('download-slugs');

const redirectInput = document.getElementById('redirect-input');
const redirectDropzone = document.getElementById('redirect-dropzone');
const redirectStatus = document.getElementById('redirect-status');
const redirectResults = document.getElementById('redirect-results');
const redirectBody = document.getElementById('redirect-body');
const downloadRedirects = document.getElementById('download-redirects');
const bulkDestinationInput = document.getElementById('bulk-destination');
const applyBulkButton = document.getElementById('apply-bulk');

let parsedSlugs = [];
let redirectRows = [];

const dropHandlers = (input, dropzone, handler) => {
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
    const file = event.dataTransfer.files?.[0];
    if (file) handler(file);
  });
  input.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) handler(file);
  });
};

dropHandlers(sitemapInput, sitemapDropzone, handleSitemapFile);
dropHandlers(redirectInput, redirectDropzone, handleRedirectFile);

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function normalizeSlug(urlString, allowedHost) {
  try {
    const url = new URL(urlString);
    if (allowedHost && url.host !== allowedHost) return null;
    const path = url.pathname || '/';
    return path === '' ? '/' : path;
  } catch (error) {
    // Fall back to relative paths if URL() fails
    if (urlString.startsWith('/')) return urlString || '/';
    return null;
  }
}

function parseSitemap(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) throw new Error('Unable to read sitemap XML');

  const locs = Array.from(doc.querySelectorAll('url > loc')).map((node) => node.textContent?.trim() || '');
  const firstHost = (() => {
    for (const loc of locs) {
      try {
        const url = new URL(loc);
        return url.host;
      } catch (_err) {
        continue;
      }
    }
    return null;
  })();

  const slugs = [];
  const seen = new Set();
  for (const loc of locs) {
    const slug = normalizeSlug(loc, firstHost || undefined);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }

  return slugs;
}

async function handleSitemapFile(file) {
  try {
    const text = await readFile(file);
    parsedSlugs = parseSitemap(text);
    sitemapStatus.textContent = `${parsedSlugs.length} slugs captured`;
    sitemapResults.hidden = false;
    slugCount.textContent = parsedSlugs.length;
    renderSlugPreview(parsedSlugs);
    populateSlugOptions(parsedSlugs);
    redirectStatus.textContent = 'Ready for redirect CSV';
  } catch (error) {
    sitemapStatus.textContent = 'Could not read sitemap';
    console.error(error);
  }
}

function renderSlugPreview(slugs) {
  slugPreview.innerHTML = '';
  slugs.slice(0, 20).forEach((slug) => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = slug;
    slugPreview.appendChild(pill);
  });
  if (slugs.length > 20) {
    const more = document.createElement('span');
    more.className = 'pill';
    more.textContent = `+${slugs.length - 20} more`;
    slugPreview.appendChild(more);
  }
}

function populateSlugOptions(slugs) {
  slugOptions.innerHTML = '';
  slugs.forEach((slug) => {
    const option = document.createElement('option');
    option.value = slug;
    slugOptions.appendChild(option);
  });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.map(parseCsvLine);
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function csvStringify(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? '';
          if (/[",\n]/.test(value)) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          return value;
        })
        .join(',')
    )
    .join('\n');
}

async function handleRedirectFile(file) {
  if (!parsedSlugs.length) {
    redirectStatus.textContent = 'Upload a sitemap first';
    return;
  }

  try {
    const text = await readFile(file);
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('Empty CSV');

    const headers = rows[0];
    const body = rows.slice(1);

    const colIndex = (name) => headers.findIndex((header) => header.toLowerCase().includes(name));
    const oldIndex = colIndex('old');
    const destIndex = colIndex('destination');
    const typeIndex = colIndex('redirect');

    if (oldIndex === -1 || typeIndex === -1) {
      throw new Error('CSV must include Old Page URL and Redirect Type columns');
    }

    redirectRows = body.map((row) => ({
      old: row[oldIndex] || '',
      destination: ensureLeadingSlash(row[destIndex] || ''),
      type: row[typeIndex] || '301',
    }));

    renderRedirectTable();
    redirectResults.hidden = false;
    redirectStatus.textContent = `Loaded ${redirectRows.length} redirects`;
  } catch (error) {
    redirectStatus.textContent = 'Could not read CSV';
    console.error(error);
  }
}

function ensureLeadingSlash(value) {
  if (!value) return '';
  return value.startsWith('/') ? value : '/' + value.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/*/, '');
}

function renderRedirectTable() {
  redirectBody.innerHTML = '';

  redirectRows.forEach((row, index) => {
    const tr = document.createElement('tr');

    const oldTd = document.createElement('td');
    oldTd.textContent = row.old || '';

    const destTd = document.createElement('td');
    const destInput = document.createElement('input');
    destInput.setAttribute('list', 'slug-options');
    destInput.value = row.destination || '';
    destInput.placeholder = 'Choose destination slug';
    destInput.addEventListener('input', (event) => {
      redirectRows[index].destination = ensureLeadingSlash(event.target.value);
    });
    destTd.appendChild(destInput);

    const typeTd = document.createElement('td');
    typeTd.textContent = row.type || '301';

    tr.appendChild(oldTd);
    tr.appendChild(destTd);
    tr.appendChild(typeTd);
    redirectBody.appendChild(tr);
  });
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

downloadSlugs.addEventListener('click', () => {
  if (!parsedSlugs.length) return;
  const rows = [['Slug'], ...parsedSlugs.map((slug) => [slug])];
  const content = csvStringify(rows);
  downloadFile('sitemap-slugs.csv', content);
});

applyBulkButton.addEventListener('click', () => {
  const value = ensureLeadingSlash(bulkDestinationInput.value || '');
  if (!value) return;
  redirectRows = redirectRows.map((row) => ({ ...row, destination: value }));
  renderRedirectTable();
});

downloadRedirects.addEventListener('click', () => {
  if (!redirectRows.length) return;
  const rows = [
    ['Old Page URL', 'Destination Page URL', 'Redirect Type'],
    ...redirectRows.map((row) => [row.old, ensureLeadingSlash(row.destination), row.type || '301']),
  ];
  const content = csvStringify(rows);
  downloadFile('formatted-redirects.csv', content);
});
